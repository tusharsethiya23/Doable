// API calls for notifications, plus a live connection that receives new ones instantly
// (and reconnects automatically if the server restarts or the network drops).
import { api, refreshAccessToken } from '../lib/api';
import { readSSE } from '../lib/sse';
import { API_URL } from '../config';
import { useAuthStore } from '../store/authStore';

export const listNotifications = () => api.get('/notifications').then((r) => r.data);
export const markNotificationsRead = (ids) => api.post('/notifications/read', ids ? { ids } : {});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Keeps a live notification stream open until `signal` is aborted.
 * onEvent(name, data) receives: ready, notification, conversation_updated.
 */
export async function connectNotificationStream({ onEvent, signal }) {
  let delay = 1000;
  while (!signal.aborted) {
    try {
      const open = () =>
        fetch(`${API_URL}/notifications/stream`, {
          signal,
          credentials: 'include',
          headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
        });
      let res = await open();
      if (res.status === 401) {
        await refreshAccessToken();
        res = await open();
      }
      if (res.ok) {
        await readSSE(res.body, (event, data) => {
          if (event === 'ready') delay = 1000; // connected: reset the retry delay
          onEvent(event, data);
        });
      }
    } catch {
      if (signal.aborted) return;
    }
    // Stream ended or failed: wait, then reconnect (1s, 2s, 4s… up to 30s)
    await sleep(delay);
    delay = Math.min(delay * 2, 30000);
  }
}
