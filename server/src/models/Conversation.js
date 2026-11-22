// Conversation model: one chat thread belonging to a user (its messages live in the Message collection).
// When the agent waits for the user to approve an action, the conversation is "awaiting_approval" and
// `pendingTurn` remembers the paused step so it can be resumed.
import mongoose from 'mongoose';

export const DEFAULT_TITLE = 'New chat';

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: DEFAULT_TITLE, trim: true, maxlength: 120 },
    lastMessageAt: { type: Date, default: Date.now }, // used to sort the sidebar
    status: { type: String, enum: ['idle', 'awaiting_approval', 'resuming'], default: 'idle' },
    pendingTurn: {
      assistantMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
      // tool_result blocks of tools in that turn that already ran (keyed by tool_use_id)
      results: { type: mongoose.Schema.Types.Mixed },
    },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
        delete ret.pendingTurn;
        return ret;
      },
    },
  }
);

// Fast "my conversations, newest first" queries
conversationSchema.index({ userId: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
