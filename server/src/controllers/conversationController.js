// HTTP handlers for /api/conversations: list/create/rename/delete chats and run the agent on new messages.
import { Conversation, DEFAULT_TITLE } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import {
  findOwnedConversation,
  findVisibleMessages,
  buildApiHistory,
  makeTitle,
  deleteConversation,
} from '../services/chatService.js';
import { runAgent } from '../services/agentService.js';
import { friendlyLLMError } from '../services/llmService.js';
import { openSSE } from '../utils/sse.js';

export async function listConversations(req, res) {
  const conversations = await Conversation.find({ userId: req.user._id }).sort({ lastMessageAt: -1 }).limit(100);
  res.json({ success: true, conversations });
}

export async function createConversation(req, res) {
  const conversation = await Conversation.create({ userId: req.user._id });
  res.status(201).json({ success: true, conversation });
}

export async function getConversation(req, res) {
  const conversation = await findOwnedConversation(req.params.id, req.user._id);
  const messages = await findVisibleMessages(conversation._id);
  res.json({ success: true, conversation, messages });
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
 * POST /api/conversations/:id/messages
 * Saves the user's message, runs the agent, and streams progress back as Server-Sent Events:
 *   start → { userMessage }   title → { conversation }   turn_start / turn_reset → {}
 *   delta → { text }          tool_start → { id, name }  tool_result → { id, status }
 *   done → { messages }       error → { message }
 */
export async function sendMessage(req, res) {
  const user = req.user;
  const conversation = await findOwnedConversation(req.params.id, user._id);

  const userMessage = await Message.create({
    conversationId: conversation._id,
    userId: user._id,
    role: 'user',
    content: req.body.content,
    text: req.body.content,
  });

  // Name the chat after its first message
  const isFirstMessage = conversation.title === DEFAULT_TITLE;
  if (isFirstMessage) conversation.title = makeTitle(req.body.content);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const history = await buildApiHistory(conversation._id);

  // From here on we answer with a stream, so errors are sent as events (not JSON responses)
  const sse = openSSE(res);
  sse.send('start', { userMessage });
  if (isFirstMessage) sse.send('title', { conversation });

  // If the browser disconnects (Stop button / closed tab), cancel the AI request to save tokens
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    const messages = await runAgent({ user, conversation, history, signal: controller.signal, emit: sse.send });
    sse.send('done', { messages });
  } catch (err) {
    console.error('Agent error:', err);
    sse.send('error', { message: friendlyLLMError(err) });
  } finally {
    sse.end();
  }
}
