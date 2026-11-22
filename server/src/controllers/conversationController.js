// HTTP handlers for /api/conversations: list/create/rename/delete chats and stream AI replies.
import { Conversation, DEFAULT_TITLE } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { findOwnedConversation, buildApiHistory, makeTitle, deleteConversation } from '../services/chatService.js';
import { streamReply, extractText, isAbortError, friendlyLLMError } from '../services/llmService.js';
import { buildSystemPrompt } from '../prompts/systemPrompt.js';
import { openSSE } from '../utils/sse.js';

const REFUSAL_TEXT = "Sorry, I can't help with that request.";

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
  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
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
 * Saves the user's message, then streams Claude's reply back as Server-Sent Events:
 *   start → { userMessage }      title → { conversation }
 *   delta → { text }             done  → { message }        error → { message }
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

  let partialText = '';
  const saveAssistant = (fields) =>
    Message.create({ conversationId: conversation._id, userId: user._id, role: 'assistant', ...fields });

  try {
    const final = await streamReply({
      system: buildSystemPrompt(user),
      messages: history,
      signal: controller.signal,
      onText: (text) => {
        partialText += text;
        sse.send('delta', { text });
      },
    });

    // A refusal means every model in the fallback chain declined: drop the partial text
    if (final.stop_reason === 'refusal') {
      const message = await saveAssistant({ content: REFUSAL_TEXT, text: REFUSAL_TEXT, status: 'refused', stopReason: 'refusal' });
      sse.send('done', { message });
      return;
    }

    const message = await saveAssistant({
      content: final.content, // stored unchanged so it can be replayed to the API later
      text: extractText(final.content),
      model: final.model,
      stopReason: final.stop_reason,
      usage: {
        inputTokens: final.usage?.input_tokens,
        outputTokens: final.usage?.output_tokens,
        cacheReadTokens: final.usage?.cache_read_input_tokens,
      },
    });
    sse.send('done', { message });
  } catch (err) {
    if (isAbortError(err)) {
      // User stopped the reply: keep what was already shown so the chat history matches the screen
      if (partialText.trim()) {
        await saveAssistant({ content: [{ type: 'text', text: partialText }], text: partialText, status: 'stopped' });
      }
      return;
    }
    console.error('LLM error:', err);
    sse.send('error', { message: friendlyLLMError(err) });
  } finally {
    sse.end();
  }
}
