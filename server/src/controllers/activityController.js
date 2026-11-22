// HTTP handler for /api/activity: the user's log of actions the agent performed (newest first, paginated).
import { Action } from '../models/Action.js';

export async function listActivity(req, res) {
  const { status, tool, before } = req.query;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const filter = { userId: req.user._id };
  if (status) filter.status = String(status);
  if (tool) filter.toolName = String(tool);
  if (before) filter.createdAt = { $lt: new Date(String(before)) }; // cursor: load items older than this

  const actions = await Action.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1); // fetch one extra to know if there are more

  const hasMore = actions.length > limit;
  res.json({ success: true, actions: actions.slice(0, limit), hasMore });
}
