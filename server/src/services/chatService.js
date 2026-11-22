// Chat business logic: ownership checks, loading history for the AI, auto-titles and deleting chats.
import { Conversation, DEFAULT_TITLE } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ApiError } from '../utils/ApiError.js';
import { toApiContent } from './llmService.js';

// Returns the conversation only if it belongs to this user (otherwise 404, so ids can't be probed)
export async function findOwnedConversation(conversationId, userId) {
  const conversation = await Conversation.findOne({ _id: conversationId, userId });
  if (!conversation) throw new ApiError(404, 'Conversation not found');
  return conversation;
}

// Messages the user sees (hides the internal tool-result turns)
export function findVisibleMessages(conversationId) {
  return Message.find({ conversationId, kind: { $ne: 'tool_results' } }).sort({ createdAt: 1 });
}

// Loads all turns of a conversation in the format the Claude API expects
export async function buildApiHistory(conversationId) {
  const stored = await Message.find({ conversationId, status: { $ne: 'refused' } })
    .sort({ createdAt: 1 })
    .lean();

  const history = [];
  stored.forEach((m, i) => {
    history.push({ role: m.role, content: m.role === 'assistant' ? toApiContent(m.content) : m.content });

    // Repair: every tool_use must be answered by a tool_result in the next message, or the API rejects the request.
    // This can only be missing if the server crashed mid-task, so answer those calls with an error.
    const toolUseIds = Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_use').map((b) => b.id) : [];
    if (toolUseIds.length && stored[i + 1]?.kind !== 'tool_results') {
      history.push({
        role: 'user',
        content: toolUseIds.map((id) => ({ type: 'tool_result', tool_use_id: id, is_error: true, content: 'Interrupted before the tool ran.' })),
      });
    }
  });
  return history;
}

// Simple auto-title: the first line of the first message, shortened
export function makeTitle(text) {
  const firstLine = text.trim().split('\n')[0];
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine || DEFAULT_TITLE;
}

// Deletes a conversation together with all its messages (the activity log is kept as an audit trail)
export async function deleteConversation(conversation) {
  await Message.deleteMany({ conversationId: conversation._id });
  await conversation.deleteOne();
}
