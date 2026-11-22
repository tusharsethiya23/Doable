// Notification state (Zustand): the bell's list + unread count, pop-up toasts, and the live connection.
import { create } from 'zustand';
import * as notificationApi from '../services/notificationService';
import { useChatStore } from './chatStore';

const TOAST_MS = 7000;

export const useNotificationStore = create((set, get) => ({
  items: [],
  unreadCount: 0,
  toasts: [], // notifications shown briefly in the corner
  controller: null,

  // Load the latest notifications and open the live stream (called after login)
  async start() {
    if (get().controller) return;
    const controller = new AbortController();
    set({ controller });

    try {
      const { notifications, unreadCount } = await notificationApi.listNotifications();
      set({ items: notifications, unreadCount });
    } catch {
      // the bell just stays empty; the stream below may still work
    }

    notificationApi.connectNotificationStream({
      signal: controller.signal,
      onEvent: (event, data) => {
        if (event === 'notification') get().receive(data.notification);
        if (event === 'conversation_updated') {
          // A scheduled task posted into a chat: refresh the sidebar, and the open chat if it's that one
          const chat = useChatStore.getState();
          chat.loadConversations();
          if (chat.activeId === data.conversationId && !chat.isStreaming) chat.openConversation(data.conversationId);
        }
      },
    });
  },

  // Close the stream and forget everything (logout)
  stop() {
    get().controller?.abort();
    set({ controller: null, items: [], unreadCount: 0, toasts: [] });
  },

  receive(notification) {
    set((s) => ({
      items: [notification, ...s.items].slice(0, 50),
      unreadCount: s.unreadCount + 1,
      toasts: [...s.toasts, notification],
    }));
    setTimeout(() => get().dismissToast(notification.id), TOAST_MS);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ids = specific notifications, or nothing for "mark all as read"
  async markRead(ids) {
    set((s) => ({
      items: s.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
      unreadCount: ids ? Math.max(0, s.unreadCount - s.items.filter((n) => ids.includes(n.id) && !n.read).length) : 0,
    }));
    try {
      await notificationApi.markNotificationsRead(ids);
    } catch {
      // not critical: they'll show as unread again after a reload
    }
  },
}));
