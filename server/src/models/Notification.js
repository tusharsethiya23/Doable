// Notification model: in-app messages for the user (reminders, finished scheduled tasks, approvals needed, failures).
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['reminder', 'task_done', 'task_failed', 'approval_needed'], required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    link: String, // where clicking it goes, e.g. /chat/<id>
    read: { type: Boolean, default: false },
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

notificationSchema.index({ userId: 1, createdAt: -1 });
// Old notifications are deleted automatically after 60 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

export const Notification = mongoose.model('Notification', notificationSchema);
