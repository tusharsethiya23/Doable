// Tool: list_scheduled_tasks — shows the user's reminders and scheduled tasks (so they can be reviewed or cancelled).
import { z } from 'zod';
import { ScheduledTask } from '../models/ScheduledTask.js';
import { describeSchedule } from '../services/taskService.js';

export default {
  name: 'list_scheduled_tasks',
  description:
    'List the user\'s reminders and scheduled tasks. Call this when they ask what reminders/tasks they have, or before cancelling one (to get its id).',
  type: 'read',
  inputSchema: z.object({
    includeFinished: z.boolean().default(false).describe('Also include one-time items that already ran.'),
  }),

  async run({ includeFinished }, { user }) {
    const filter = { userId: user._id, ...(!includeFinished && { state: { $ne: 'done' } }) };
    const tasks = await ScheduledTask.find(filter).sort({ runAt: 1 }).limit(50);
    return {
      count: tasks.length,
      items: tasks.map((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        paused: !t.enabled,
        ...describeSchedule(t),
        lastRun: t.lastRunAt ? { at: t.lastRunAt, status: t.lastStatus } : undefined,
      })),
    };
  },
};
