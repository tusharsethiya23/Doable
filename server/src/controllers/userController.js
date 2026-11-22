// HTTP handlers for /api/users: view, update and delete the logged-in user's profile.
import { clearRefreshCookie } from '../utils/tokens.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Action } from '../models/Action.js';
import { disconnectGoogle } from '../services/googleAuthService.js';

export async function getMe(req, res) {
  res.json({ success: true, user: req.user });
}

export async function updateMe(req, res) {
  Object.assign(req.user, req.body); // body is already validated (only name, timezone, signature)
  await req.user.save();
  res.json({ success: true, user: req.user });
}

export async function deleteMe(req, res) {
  // Remove everything the user owns (later phases add tasks, etc.)
  await disconnectGoogle(req.user._id); // revokes our access at Google too
  await Message.deleteMany({ userId: req.user._id });
  await Action.deleteMany({ userId: req.user._id });
  await Conversation.deleteMany({ userId: req.user._id });
  await req.user.deleteOne();
  clearRefreshCookie(res);
  res.json({ success: true });
}
