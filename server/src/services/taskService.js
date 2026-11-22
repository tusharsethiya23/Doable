// Scheduled task logic shared by the agent tools and the /api/tasks endpoints:
// work out when a task first runs, create it (with limits), describe it, pause/resume and delete it.
import { ScheduledTask, MAX_ACTIVE_TASKS } from '../models/ScheduledTask.js';
import { zonedToDate, formatInZone } from '../utils/time.js';
import { nextCronRun, nextCronRuns, cronProblem } from '../utils/schedule.js';
import { ApiError } from '../utils/ApiError.js';

// Minimum time between repeats: agent tasks call the AI (costs money), reminders are cheap
export const MIN_REPEAT_MINUTES = { agent_task: 60, reminder: 5 };

/**
 * Works out the first run time from a one-off local time (`at`) and/or a cron (`repeat`).
 * Throws an Error with a readable message if the schedule is invalid.
 */
export function resolveSchedule({ at, repeat, kind }, timeZone) {
  if (!at && !repeat) throw new Error('Give a time (at) or a repeating schedule (repeat)');
  if (repeat) {
    const problem = cronProblem(repeat, timeZone, MIN_REPEAT_MINUTES[kind]);
    if (problem) throw new Error(problem);
  }

  const atDate = at ? zonedToDate(at, timeZone) : null;
  if (atDate && atDate <= new Date()) throw new Error('That time is in the past. Pick a future time.');

  // Repeating: first run is the next cron time (after `at`, if a start time was given)
  const runAt = repeat ? nextCronRun(repeat, timeZone, atDate ? new Date(atDate.getTime() - 1000) : new Date()) : atDate;
  return { runAt, cron: repeat || null };
}

// Short human description, e.g. "Mon, Nov 23, 2026, 9:00 AM (repeats: 0 9 * * 1-5)"
export function describeSchedule(task) {
  const next = task.enabled && task.state !== 'done' ? formatInZone(task.runAt, task.timezone) : null;
  return {
    nextRun: next,
    repeats: task.cron || null,
    upcoming: task.cron ? nextCronRuns(task.cron, task.timezone, 3).map((d) => formatInZone(d, task.timezone)) : undefined,
  };
}

export async function createTask(user, fields) {
  const active = await ScheduledTask.countDocuments({ userId: user._id, enabled: true, state: { $ne: 'done' } });
  if (active >= MAX_ACTIVE_TASKS) {
    throw new Error(`You already have ${MAX_ACTIVE_TASKS} active reminders/tasks. Cancel some first.`);
  }
  return ScheduledTask.create({ userId: user._id, timezone: user.timezone, ...fields });
}

export async function findOwnedTask(taskId, userId) {
  const task = await ScheduledTask.findOne({ _id: taskId, userId });
  if (!task) throw new ApiError(404, 'Task not found');
  return task;
}

// Pause or resume. Resuming a repeating task that missed runs while paused moves it to the next future time.
export async function setTaskEnabled(task, enabled) {
  task.enabled = enabled;
  if (enabled && task.cron && task.runAt < new Date()) task.runAt = nextCronRun(task.cron, task.timezone);
  if (enabled && !task.cron && task.runAt < new Date()) throw new ApiError(400, 'This one-time task is in the past. Create a new one instead.');
  await task.save();
  return task;
}
