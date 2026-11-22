// Action model: audit log of every tool the agent ran or asked to run.
// Write actions go through approval: pending → approved → running → success|failed, or pending → rejected|expired.
import mongoose from 'mongoose';

const MAX_STORED_OUTPUT = 5000; // keep the log small; the full result only goes to the AI
export const APPROVAL_TTL_MS = 15 * 60 * 1000; // pending approvals expire after 15 minutes (SRS FR-5.5)

export const ACTION_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'running', 'success', 'failed'];

const actionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }, // assistant turn that requested it
    toolUseId: String, // id the AI gave this call (links the log to the chat message)
    toolName: { type: String, required: true },
    type: { type: String, enum: ['read', 'write'], default: 'read' },
    input: mongoose.Schema.Types.Mixed, // what the AI asked for
    editedInput: mongoose.Schema.Types.Mixed, // what the user changed it to on the approval card (if edited)
    preview: mongoose.Schema.Types.Mixed, // { title, fields: [{ label, value, long? }] } shown on the approval card
    output: { type: String, set: (v) => (v && v.length > MAX_STORED_OUTPUT ? `${v.slice(0, MAX_STORED_OUTPUT)}…` : v) },
    error: String,
    status: { type: String, enum: ACTION_STATUSES, required: true },
    expiresAt: Date, // only for pending approvals
    decidedAt: Date,
    durationMs: Number,
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
        return ret;
      },
    },
  }
);

actionSchema.index({ userId: 1, createdAt: -1 });
actionSchema.index({ messageId: 1, status: 1 });

export const Action = mongoose.model('Action', actionSchema);
