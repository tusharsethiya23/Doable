// Chat business logic: ownership checks, loading history for the AI, saving replies and auto-titles.
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

// Loads all turns of a conversation in the format the Claude API expects
export async function buildApiHistory(conversationId) {
  const messages = await Message.find({ conversationId, status: { $ne: 'refused' } })
    .sort({ createdAt: 1 })
    .lean();

  return messages.map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? toApiContent(m.content) : m.content,
  }));
}

// Simple auto-title: the first line of the first message, shortened
export function makeTitle(text) {
  const firstLine = text.trim().split('\n')[0];
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine || DEFAULT_TITLE;
}

// Deletes a conversation together with all its messages
export async function deleteConversation(conversation) {
  await Message.deleteMany({ conversationId: conversation._id });
  await conversation.deleteOne();
}
