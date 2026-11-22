// HTTP handler for /api/actions/:id/decision — the Approve / Edit / Reject buttons on approval cards.
import { decideAction } from '../services/approvalService.js';

export async function decide(req, res) {
  const { decision, input } = req.body;
  const result = await decideAction({ user: req.user, actionId: req.params.id, decision, input });
  res.json({ success: true, ...result });
}
