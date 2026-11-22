// HTTP handlers for /api/tasks: the user's reminders and scheduled tasks (list, pause/resume, delete).
import { ScheduledTask } from '../models/ScheduledTask.js';
import { findOwnedTask, setTaskEnabled, describeSchedule } from '../services/taskService.js';

const withSchedule = (task) => ({ ...task.toJSON(), schedule: describeSchedule(task) });

export async function listTasks(req, res) {
  // Upcoming first, finished one-off items last
  const tasks = await ScheduledTask.find({ userId: req.user._id }).sort({ state: 1, runAt: 1 }).limit(100);
  res.json({ success: true, tasks: tasks.map(withSchedule) });
}

export async function updateTask(req, res) {
  const task = await findOwnedTask(req.params.id, req.user._id);
  await setTaskEnabled(task, req.body.enabled);
  res.json({ success: true, task: withSchedule(task) });
}

export async function deleteTask(req, res) {
  const task = await findOwnedTask(req.params.id, req.user._id);
  await task.deleteOne();
  res.json({ success: true });
}
