// Tool: create_reminder — reminds the user at a time (once or repeating) with an in-app notification and optional email.
// Only affects the user themself, so it runs without an approval card.
import { z } from 'zod';
import { resolveSchedule, createTask, describeSchedule } from '../services/taskService.js';
import { at, repeat } from './scheduleSchemas.js';

export default {
  name: 'create_reminder',
  description:
    'Set a reminder for the user. Call this when they say "remind me…", "don\'t let me forget…", or want a repeating nudge (e.g. every weekday at 9). They get an in-app notification (and optionally an email) at that time.',
  type: 'write',
  autoApprove: true, // low risk: only notifies the user (SRS FR-5.6)
  inputSchema: z
    .object({
      message: z.string().trim().min(1).max(200).describe('What to remind them about, written to the user, e.g. "Submit the report".'),
      at,
      repeat,
      emailMe: z.boolean().default(false).describe('Also send the reminder to their email (needs Google connected).'),
    })
    .refine((v) => v.at || v.repeat, { message: 'Give either at or repeat', path: ['at'] }),

  async run({ message, at: atTime, repeat: cron, emailMe }, { user, conversationId }) {
    // Throws a readable error (past time, bad cron…) that is passed back to the AI
    const schedule = resolveSchedule({ at: atTime, repeat: cron, kind: 'reminder' }, user.timezone);
    const task = await createTask(user, { kind: 'reminder', title: message, ...schedule, emailMe, sourceConversationId: conversationId });
    return { created: true, reminderId: task.id, message, ...describeSchedule(task) };
  },
};
