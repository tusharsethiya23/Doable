// HTTP handlers for /api/admin (admins only): stats, user list, disable/enable users and set AI budgets.
import { getStats, listUsers, updateUser } from '../services/adminService.js';

export async function stats(_req, res) {
  res.json({ success: true, stats: await getStats() });
}

export async function users(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : undefined;
  res.json({ success: true, users: await listUsers({ q }) });
}

export async function patchUser(req, res) {
  res.json({ success: true, user: await updateUser(req.user, req.params.id, req.body) });
}
