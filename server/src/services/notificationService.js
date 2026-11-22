// Notifications: saves them and pushes them live to every open browser tab of that user
// (each tab keeps a Server-Sent Events connection to /api/notifications/stream).
import { Notification } from '../models/Notification.js';

const subscribers = new Map(); // userId → Set of send(event, data) functions

export function subscribe(userId, send) {
  const key = String(userId);
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(send);
  return () => {
    subscribers.get(key)?.delete(send);
    if (!subscribers.get(key)?.size) subscribers.delete(key);
  };
}

function publish(userId, event, data) {
  for (const send of subscribers.get(String(userId)) || []) send(event, data);
}

/** Creates a notification and delivers it instantly to the user's open tabs. */
export async function notify(userId, { type, title, body, link }) {
  const notification = await Notification.create({
    userId,
    type,
    title: title.slice(0, 200),
    body: body?.slice(0, 1000),
    link,
  });
  publish(userId, 'notification', { notification });
  return notification;
}

// Tells open tabs that a conversation changed in the background (e.g. a scheduled task posted to it)
export function publishConversationUpdate(userId, conversationId) {
  publish(userId, 'conversation_updated', { conversationId: String(conversationId) });
}
