// ScheduledTask model: reminders and agent tasks that run later or on a repeating (cron) schedule.
// The scheduler picks up tasks whose runAt has passed, runs them, then sets the next runAt (or marks them done).
import mongoose from 'mongoose';

export const MAX_ACTIVE_TASKS = 20; // per user — keeps scheduled AI usage (and cost) bounded

const scheduledTaskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['reminder', 'agent_task'], required: true },
    title: { type: String, required: true, maxlength: 200 }, // reminder text, or short task name
    instruction: { type: String, maxlength: 2000 }, // agent tasks: what the assistant should do on each run
    cron: String, // repeating schedule (null = runs once)
    timezone: { type: String, required: true }, // cron and times are interpreted in this zone
    runAt: { type: Date, required: true }, // next time it should run
    enabled: { type: Boolean, default: true },
    // scheduled = waiting for runAt, running = in progress (locked), done = one-off finished
    state: { type: String, enum: ['scheduled', 'running', 'done'], default: 'scheduled' },
    lockedAt: Date, // when a scheduler instance claimed it (crash recovery)
    emailMe: { type: Boolean, default: false }, // reminders: also email the user
    allowEmailToMe: { type: Boolean, default: false }, // agent tasks: may email the user's own address without asking
    sourceConversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }, // where it was created
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }, // agent tasks: where runs are posted
    lastRunAt: Date,
    lastStatus: { type: String, enum: ['success', 'failed', 'needs_approval'] },
    lastError: String,
    runCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
        delete ret.lockedAt;
        return ret;
      },
    },
  }
);

// The scheduler's query: enabled tasks that are due
scheduledTaskSchema.index({ state: 1, enabled: 1, runAt: 1 });
scheduledTaskSchema.index({ userId: 1, createdAt: -1 });

export const ScheduledTask = mongoose.model('ScheduledTask', scheduledTaskSchema);
