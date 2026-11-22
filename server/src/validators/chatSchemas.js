// Zod schemas for conversation and message request bodies.
import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(10000, 'Message is too long (max 10,000 characters)'),
});

export const renameConversationSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(120),
});
