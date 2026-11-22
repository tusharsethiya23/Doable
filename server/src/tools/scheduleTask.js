// Tool: schedule_task — schedules the assistant to do something later or on a repeat (e.g. "every Monday at 9,
// email me my week's meetings"). Each run happens in its own chat; actions still need approval unless pre-allowed.
// type 'write' → the user approves the schedule itself on a card first.
import { z } from 'zod';
import { resolveSchedule, createTask, describeSchedule, MIN_REPEAT_MINUTES } from '../services/taskService.js';
import { formatInZone } from '../utils/time.js';
import { nextCronRuns } from '../utils/schedule.js';
import { at, repeat } from './scheduleSchemas.js';

const inputSchema = z
  .object({
    title: z.string().trim().min(1).max(100).describe('Short name, e.g. "Weekly meeting summary".'),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe('What to do on each run, written as a request to the assistant, e.g. "List my meetings for this week and email me a summary."'),
    at,
    repeat,
    allowEmailToMe: z
      .boolean()
      .default(false)
      .describe("Let each run email the USER'S OWN address without asking (for summaries/digests). Any other action still waits for approval."),
  })
  .refine((v) => v.at || v.repeat, { message: 'Give either at or repeat', path: ['at'] });

export default {
  name: 'schedule_task',
  description: `Schedule the assistant to do a task later or repeatedly (e.g. a daily inbox summary, a weekly agenda email, checking something at a set time). Use create_reminder instead for a simple reminder. Repeating tasks can run at most once per ${MIN_REPEAT_MINUTES.agent_task} minutes. The user approves the schedule before it is saved.`,
  type: 'write',
  inputSchema,

  async preview(input, { user }) {
    const tz = user.timezone;
    // An invalid schedule throws here, so the AI gets the error instead of the user getting a broken card
    const { runAt } = resolveSchedule({ at: input.at, repeat: input.repeat, kind: 'agent_task' }, tz);
    const when = input.repeat
      ? `Repeats — next: ${nextCronRuns(input.repeat, tz, 3, new Date(runAt.getTime() - 1000)).map((d) => formatInZone(d, tz)).join(' · ')}`
      : formatInZone(runAt, tz);
    return {
      title: 'Schedule a task',
      fields: [
        { label: 'Name', value: input.title },
        { label: 'When', value: when },
        { label: 'Each time', value: input.instruction, long: true },
        { label: 'Emails to you', value: input.allowEmailToMe ? 'Sent automatically' : 'Will ask for approval' },
        { label: 'Other actions', value: 'Will ask for your approval' },
      ],
    };
  },

  async run(input, { user, conversationId }) {
    // Re-checked at run time: the approved time might have passed while the card was open
    const schedule = resolveSchedule({ at: input.at, repeat: input.repeat, kind: 'agent_task' }, user.timezone);
    const task = await createTask(user, {
      kind: 'agent_task',
      title: input.title,
      instruction: input.instruction,
      allowEmailToMe: input.allowEmailToMe,
      sourceConversationId: conversationId,
      ...schedule,
    });
    return { scheduled: true, taskId: task.id, title: task.title, ...describeSchedule(task) };
  },
};
