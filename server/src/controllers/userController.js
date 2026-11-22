// HTTP handlers for /api/users: view, update and delete the logged-in user's profile.
import { clearRefreshCookie } from '../utils/tokens.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Action } from '../models/Action.js';
import { ScheduledTask } from '../models/ScheduledTask.js';
import { Notification } from '../models/Notification.js';
import { disconnectGoogle } from '../services/googleAuthService.js';
import { usageSummary } from '../services/usageService.js';

export async function getMe(req, res) {
  res.json({ success: true, user: req.user, usage: usageSummary(req.user) });
}

// GET /api/users/me/usage — this month's AI spend vs. budget (shown in Settings)
export async function getMyUsage(req, res) {
  res.json({ success: true, usage: usageSummary(req.user) });
}

export async function updateMe(req, res) {
  Object.assign(req.user, req.body); // body is already validated (only name, timezone, signature)
  await req.user.save();
  res.json({ success: true, user: req.user });
}

export async function deleteMe(req, res) {
  // Remove everything the user owns (SRS FR-1.7)
  const mine = { userId: req.user._id };
  await disconnectGoogle(req.user._id); // revokes our access at Google too
  await ScheduledTask.deleteMany(mine); // stop scheduled work first
  await Promise.all([Message.deleteMany(mine), Action.deleteMany(mine), Conversation.deleteMany(mine), Notification.deleteMany(mine)]);
  await req.user.deleteOne();
  clearRefreshCookie(res);
  res.json({ success: true });
}
