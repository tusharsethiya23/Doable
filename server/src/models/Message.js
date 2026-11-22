// Message model: one turn in a conversation.
// `content` is stored exactly as the Claude API returned it (thinking + tool blocks included) so it can be sent back unchanged;
// `text` is the plain text, and `parts` (built in toJSON) is what the UI renders: text and tool-call chips in order.
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    // message = normal chat turn; tool_results = hidden turn carrying tool outputs back to Claude
    kind: { type: String, enum: ['message', 'tool_results'], default: 'message' },
    content: { type: mongoose.Schema.Types.Mixed, required: true }, // string or array of API content blocks
    text: { type: String, default: '' },
    // complete = normal reply, stopped = user pressed Stop, refused = model declined (not sent back to the API)
    status: { type: String, enum: ['complete', 'stopped', 'refused'], default: 'complete' },
    // Outcome of each tool call made in this (assistant) turn. pending = waiting for the user's approval.
    // needsIntegration = the tool failed because an account (e.g. 'google') must be connected first
    toolRuns: [
      {
        _id: false,
        toolUseId: String,
        name: String,
        status: { type: String, enum: ['success', 'failed', 'pending', 'rejected', 'expired'] },
        needsIntegration: String,
      },
    ],
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
          ...(ret.role === 'assistant' && { parts: toParts(ret) }),
        };
      },
    },
  }
);

// Turns stored API blocks into UI parts: [{ type: 'text', text }, { type: 'tool', id, name, status }]
function toParts(ret) {
  if (!Array.isArray(ret.content)) return [{ type: 'text', text: ret.text }];

  const runsById = new Map((ret.toolRuns || []).map((r) => [r.toolUseId, r]));
  const parts = [];
  for (const block of ret.content) {
    if (block.type === 'text' && block.text) {
      const last = parts.at(-1);
      if (last?.type === 'text') last.text += block.text;
      else parts.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
      const run = runsById.get(block.id);
      parts.push({
        type: 'tool',
        id: block.id,
        name: block.name,
        status: run?.status ?? 'success',
        ...(run?.needsIntegration && { needsIntegration: run.needsIntegration }),
      });
    } else if (block.type === 'web_search_tool_result' && !Array.isArray(block.content)) {
      const part = parts.find((p) => p.id === block.tool_use_id);
      if (part) part.status = 'failed'; // search returned an error object
    }
  }
  return parts;
}

messageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = mongoose.model('Message', messageSchema);
