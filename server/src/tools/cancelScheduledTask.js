// Tool: cancel_scheduled_task — deletes one of the user's reminders or scheduled tasks.
// Low risk (it only stops something the user set up), so no approval card.
import { z } from 'zod';
import { ScheduledTask } from '../models/ScheduledTask.js';

export default {
  name: 'cancel_scheduled_task',
  description: 'Cancel (delete) a reminder or scheduled task. Get its id from list_scheduled_tasks first.',
  type: 'write',
  autoApprove: true,
  inputSchema: z.object({
    taskId: z.string().min(1).describe('Id from list_scheduled_tasks.'),
  }),

  async run({ taskId }, { user }) {
    if (!/^[a-f0-9]{24}$/i.test(taskId)) throw new Error('Invalid id. Use an id from list_scheduled_tasks.');
    const task = await ScheduledTask.findOneAndDelete({ _id: taskId, userId: user._id });
    if (!task) throw new Error('No reminder or task with that id.');
    return { cancelled: true, title: task.title, kind: task.kind };
  },
};
