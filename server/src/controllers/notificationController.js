// HTTP handlers for /api/notifications: list, mark as read, and a live stream (Server-Sent Events)
// that pushes new notifications to the browser the moment they are created.
import { Notification } from '../models/Notification.js';
import { subscribe } from '../services/notificationService.js';
import { openSSE } from '../utils/sse.js';

export async function listNotifications(req, res) {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ userId: req.user._id, read: false }),
  ]);
  res.json({ success: true, notifications, unreadCount });
}

// Body: { ids: [...] } to mark some, or {} to mark all as read
export async function markRead(req, res) {
  const filter = { userId: req.user._id, read: false, ...(req.body.ids && { _id: { $in: req.body.ids } }) };
  await Notification.updateMany(filter, { read: true });
  res.json({ success: true });
}

export async function streamNotifications(req, res) {
  const sse = openSSE(res);
  sse.send('ready', {});
  const unsubscribe = subscribe(req.user._id, sse.send);

  // A comment line every 25s keeps proxies/load balancers from closing an idle connection
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);

  res.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}
