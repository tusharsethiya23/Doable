// Message model: one turn in a conversation.
// `content` is stored exactly as the Claude API returned it (thinking blocks included) so it can be sent back unchanged;
// `text` is the plain text shown in the UI.
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: mongoose.Schema.Types.Mixed, required: true }, // string (user) or array of API content blocks (assistant)
    text: { type: String, default: '' },
    // complete = normal reply, stopped = user pressed Stop, refused = model declined (not sent back to the API)
    status: { type: String, enum: ['complete', 'stopped', 'refused'], default: 'complete' },
    model: String,
    stopReason: String,
    usage: {
      inputTokens: Number,
      outputTokens: Number,
      cacheReadTokens: Number,
    },
  },
  {
    timestamps: true,
    // Only what the UI needs (raw API blocks stay on the server)
    toJSON: {
      transform(_doc, ret) {
        return {
          id: ret._id.toString(),
          role: ret.role,
          text: ret.text,
          status: ret.status,
          createdAt: ret.createdAt,
        };
      },
    },
  }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = mongoose.model('Message', messageSchema);
