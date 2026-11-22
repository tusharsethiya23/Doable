// Admin dashboard data (SRS FR-11): platform stats from MongoDB aggregations, user list, and account controls.
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { Action } from '../models/Action.js';
import { ScheduledTask } from '../models/ScheduledTask.js';
import { currentMonth, usageSummary } from './usageService.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/text.js';

const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);
const dayKey = (date) => date.toISOString().slice(0, 10); // "2026-11-22" (UTC)

export async function getStats() {
  const since7 = daysAgo(7);
  const since14 = daysAgo(13);
  since14.setUTCHours(0, 0, 0, 0);

  const [totalUsers, newUsers7d, activeUserIds, messagesByDay, actionsByStatus, monthUsage, activeTasks] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: since7 } }),
    Message.distinct('userId', { role: 'user', kind: 'message', createdAt: { $gte: since7 } }),
    Message.aggregate([
      { $match: { role: 'user', kind: 'message', createdAt: { $gte: since14 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    Action.aggregate([{ $match: { createdAt: { $gte: since7 } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { 'usage.month': currentMonth() } },
      {
        $group: {
          _id: null,
          costUsd: { $sum: '$usage.costUsd' },
          inputTokens: { $sum: '$usage.inputTokens' },
          outputTokens: { $sum: '$usage.outputTokens' },
          webSearches: { $sum: '$usage.webSearches' },
        },
      },
    ]),
    ScheduledTask.countDocuments({ enabled: true, state: { $ne: 'done' } }),
  ]);

  // Every one of the last 14 days, including days with 0 messages
  const counts = Object.fromEntries(messagesByDay.map((d) => [d._id, d.count]));
  const messagesPerDay = Array.from({ length: 14 }, (_, i) => {
    const day = dayKey(new Date(since14.getTime() + i * 24 * 3600 * 1000));
    return { day, count: counts[day] || 0 };
  });

  const byStatus = Object.fromEntries(actionsByStatus.map((a) => [a._id, a.count]));
  const finished = (byStatus.success || 0) + (byStatus.failed || 0);
  const usage = monthUsage[0] || { costUsd: 0, inputTokens: 0, outputTokens: 0, webSearches: 0 };

  return {
    users: { total: totalUsers, new7d: newUsers7d, active7d: activeUserIds.length },
    messagesPerDay,
    actions7d: {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      errorRate: finished ? (byStatus.failed || 0) / finished : 0,
    },
    usageThisMonth: { month: currentMonth(), ...usage, _id: undefined, costUsd: Number(usage.costUsd.toFixed(2)) },
    activeScheduledTasks: activeTasks,
  };
}


// Users, newest first, optionally filtered by name/email
export async function listUsers({ q, limit = 50 }) {
  const filter = q ? { $or: [{ email: new RegExp(escapeRegex(q), 'i') }, { name: new RegExp(escapeRegex(q), 'i') }] } : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(Math.min(limit, 100));
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    disabled: u.disabled,
    createdAt: u.createdAt,
    monthlyBudgetUsd: u.monthlyBudgetUsd ?? null, // null = default budget
    usage: usageSummary(u),
  }));
}

/** Disable/enable an account and/or change its monthly AI budget (null = back to the default). */
export async function updateUser(admin, userId, { disabled, monthlyBudgetUsd }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (disabled !== undefined && user._id.equals(admin._id)) throw new ApiError(400, "You can't disable your own account");

  const update = {};
  const unset = {};
  if (disabled !== undefined) update.disabled = disabled;
  if (monthlyBudgetUsd === null) unset.monthlyBudgetUsd = 1;
  else if (monthlyBudgetUsd !== undefined) update.monthlyBudgetUsd = monthlyBudgetUsd;

  await User.updateOne(
    { _id: user._id },
    {
      $set: update,
      ...(Object.keys(unset).length && { $unset: unset }),
      ...(disabled === true && { $inc: { tokenVersion: 1 } }), // logs the user out everywhere
    }
  );
  const [updated] = await listUsers({ q: user.email, limit: 1 });
  return updated;
}
