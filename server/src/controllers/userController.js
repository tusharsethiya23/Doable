// HTTP handlers for /api/users: view, update and delete the logged-in user's profile.
import { clearRefreshCookie } from '../utils/tokens.js';

export async function getMe(req, res) {
  res.json({ success: true, user: req.user });
}

export async function updateMe(req, res) {
  Object.assign(req.user, req.body); // body is already validated (only name, timezone, signature)
  await req.user.save();
  res.json({ success: true, user: req.user });
}

export async function deleteMe(req, res) {
  await req.user.deleteOne(); // later phases will also delete conversations, tokens, tasks
  clearRefreshCookie(res);
  res.json({ success: true });
}
