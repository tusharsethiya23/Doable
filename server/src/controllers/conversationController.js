// HTTP handlers for /api/conversations: list/create/rename/delete chats, run the agent on new messages,
// and continue the agent after the user decided on approval cards.
import { Conversation, DEFAULT_TITLE } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Action } from '../models/Action.js';
import {
  findOwnedConversation,
  findVisibleMessages,
  buildApiHistory,
  makeTitle,
  deleteConversation,
  lockConversation,
  unlockConversation,
} from '../services/chatService.js';
import { assertWithinBudget, assertWithinDailyLimit } from '../services/usageService.js';
import { runAgent, resumeAgent, finalizePausedTurn } from '../services/agentService.js';
import { friendlyLLMError } from '../services/llmService.js';
import { openSSE } from '../utils/sse.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, snippetAround } from '../utils/text.js';
import { logError } from '../utils/logger.js';

// GET /api/conversations — newest first. With ?q=… it searches chat titles AND message text (SRS FR-3.5),
// and each result carries a short `snippet` around the first matching message.
export async function listConversations(req, res) {
  const userId = req.user._id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (!q) {
    const conversations = await Conversation.find({ userId }).sort({ lastMessageAt: -1 }).limit(100);
    return res.json({ success: true, conversations });
  }

  const pattern = new RegExp(escapeRegex(q), 'i');
  const [titleMatches, messageMatches] = await Promise.all([
    Conversation.find({ userId, title: pattern }).select('_id'),
    Message.find({ userId, kind: 'message', status: { $ne: 'refused' }, text: pattern })
      .sort({ createdAt: -1 })
      .limit(200)
      .select('conversationId text'),
  ]);

  // First (newest) matching message per conversation becomes its snippet
  const snippets = new Map();
  for (const m of messageMatches) {
    const id = m.conversationId.toString();
    if (!snippets.has(id)) snippets.set(id, snippetAround(m.text, q));
  }

  const ids = [...new Set([...titleMatches.map((c) => c._id.toString()), ...snippets.keys()])];
  const conversations = await Conversation.find({ _id: { $in: ids }, userId }).sort({ lastMessageAt: -1 }).limit(30);
  res.json({ success: true, conversations: conversations.map((c) => ({ ...c.toJSON(), snippet: snippets.get(c.id) })) });
}

export async function createConversation(req, res) {
  const conversation = await Conversation.create({ userId: req.user._id });
  res.status(201).json({ success: true, conversation });
}

export async function getConversation(req, res) {
  const conversation = await findOwnedConversation(req.params.id, req.user._id);
  const messages = await findVisibleMessages(conversation._id);
  // Approval cards to show again after a page reload
  const pendingActions =
    conversation.status === 'awaiting_approval'
      ? await Action.find({ messageId: conversation.pendingTurn?.assistantMessageId, preview: { $exists: true } }).sort({ createdAt: 1 })
      : [];
  res.json({ success: true, conversation, messages, pendingActions });
}

export async function renameConversation(req, res) {
  const conversation = await findOwnedConversation(req.params.id, req.user._id);
  conversation.title = req.body.title;
  await conversation.save();
  res.json({ success: true, conversation });
}

export async function removeConversation(req, res) {
  const conversation = await findOwnedConversation(req.params.id, req.user._id);
  await deleteConversation(conversation);
  res.json({ success: true });
}

/**
 * Shared streaming wrapper: opens Server-Sent Events, cancels the AI when the browser disconnects,
 * runs `work`, then sends `done` (or `error`). Events:
 *   start → { userMessage }   title → { conversation }   turn_start / turn_reset → {}
 *   delta → { text }          tool_start → { id, name }  tool_result → { id, status, needsIntegration? }
 *   approval_required → { actions }   done → { messages, awaitingApproval }   error → { message }
 * Always releases the conversation's "running" lock at the end.
 */
async function streamAgent(res, conversationId, work) {
  const sse = openSSE(res);
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    const { messages, awaitingApproval } = await work({ emit: sse.send, signal: controller.signal });
    sse.send('done', { messages, awaitingApproval });
  } catch (err) {
    logError('Agent run failed', err);
    sse.send('error', { message: err instanceof ApiError ? err.message : friendlyLLMError(err) });
  } finally {
    await unlockConversation(conversationId).catch((err) => logError('Unlocking conversation failed', err));
    sse.end();
  }
}

// POST /api/conversations/:id/messages — saves the user's message and runs the agent
export async function sendMessage(req, res) {
  const user = req.user;
  const conversation = await findOwnedConversation(req.params.id, user._id);
  await assertWithinBudget(user._id); // 429 if this month's AI budget is used up
  await assertWithinDailyLimit(user._id); // 429 if today's message limit is reached (protects the shared free quota)

  // Approvals still open → the user moved on (handled below). Otherwise claim the chat now (409 if busy).
  const closePendingApprovals = conversation.status === 'awaiting_approval';
  if (!closePendingApprovals) await lockConversation(conversation._id);

  await streamAgent(res, conversation._id, async ({ emit, signal }) => {
    if (closePendingApprovals) {
      // Finish the paused turn first (undecided actions are not done) and keep the chat locked for this reply
      const finalized = await finalizePausedTurn({ user, conversation, emit, keepLocked: true });
      if (!finalized) await lockConversation(conversation._id);
      emit('approvals_closed', {});
    }

    const userMessage = await Message.create({
      conversationId: conversation._id,
      userId: user._id,
      role: 'user',
      content: req.body.content,
      text: req.body.content,
    });
    emit('start', { userMessage });

    // Name the chat after its first message
    if (conversation.title === DEFAULT_TITLE) {
      conversation.title = makeTitle(req.body.content);
      emit('title', { conversation });
    }
    conversation.lastMessageAt = new Date();
    await conversation.save();

    const history = await buildApiHistory(conversation._id);
    return runAgent({ user, conversation, history, signal, emit });
  });
}

// POST /api/conversations/:id/continue — runs approved actions and lets the agent finish its answer
export async function continueConversation(req, res) {
  const user = req.user;
  const conversation = await findOwnedConversation(req.params.id, user._id);
  if (conversation.status !== 'awaiting_approval') throw new ApiError(409, 'Nothing is waiting for approval in this conversation');
  await assertWithinBudget(user._id);

  await streamAgent(res, conversation._id, ({ emit, signal }) => resumeAgent({ user, conversation, signal, emit }));
}
