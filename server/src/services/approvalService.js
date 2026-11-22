// Approve / reject a pending action (from an approval card). Approving can include the user's edits, which are
// validated with the tool's own schema. Status changes are atomic so a double-click can't decide twice.
import { Action } from '../models/Action.js';
import { getTool } from '../tools/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @param {object} opts
 * @param {object} opts.user
 * @param {string} opts.actionId
 * @param {'approve'|'reject'} opts.decision
 * @param {object} [opts.input] - edited tool input (approve only)
 * @returns {Promise<{ action: object, remaining: number }>} remaining = undecided actions left in the same turn
 */
export async function decideAction({ user, actionId, decision, input }) {
  const action = await Action.findOne({ _id: actionId, userId: user._id });
  if (!action) throw new ApiError(404, 'Action not found');
  if (action.status !== 'pending') throw new ApiError(409, `This action was already ${action.status}`);

  let update;
  if (action.expiresAt && action.expiresAt < new Date()) {
    update = { status: 'expired' };
  } else if (decision === 'reject') {
    update = { status: 'rejected' };
  } else {
    update = { status: 'approved' };
    if (input) {
      const tool = getTool(action.toolName);
      const parsed = tool.inputSchema.safeParse(input);
      if (!parsed.success) {
        const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        throw new ApiError(400, `Please fix: ${details.map((d) => `${d.field || 'input'} — ${d.message}`).join('; ')}`, details);
      }
      update.editedInput = parsed.data;
      if (tool.preview) update.preview = await tool.preview(parsed.data, { user }); // card shows the final version
    }
  }

  const decided = await Action.findOneAndUpdate({ _id: action._id, status: 'pending' }, { ...update, decidedAt: new Date() }, { returnDocument: 'after' });
  if (!decided) throw new ApiError(409, 'This action was already decided');

  const remaining = await Action.countDocuments({ messageId: decided.messageId, status: 'pending', expiresAt: { $gt: new Date() } });
  return { action: decided, remaining };
}
