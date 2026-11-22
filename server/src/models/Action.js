// Action model: audit log of every tool the agent ran (what, with which input, result, how long, success or failure).
import mongoose from 'mongoose';

const MAX_STORED_OUTPUT = 5000; // keep the log small; the full result only goes to the AI

const actionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    toolUseId: String, // id Claude gave this call (links the log to the chat message)
    toolName: { type: String, required: true },
    type: { type: String, enum: ['read', 'write'], default: 'read' },
    input: mongoose.Schema.Types.Mixed,
    output: { type: String, set: (v) => (v && v.length > MAX_STORED_OUTPUT ? `${v.slice(0, MAX_STORED_OUTPUT)}…` : v) },
    error: String,
    // Phase 5 adds: pending_confirmation, approved, rejected, expired
    status: { type: String, enum: ['success', 'failed'], required: true },
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

export const Action = mongoose.model('Action', actionSchema);
