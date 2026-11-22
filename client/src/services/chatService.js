// API calls for conversations, plus streamMessage() which sends a message and streams the AI reply.
import { api, refreshAccessToken } from '../lib/api';
import { readSSE } from '../lib/sse';
import { API_URL } from '../config';
import { useAuthStore } from '../store/authStore';

export const listConversations = () => api.get('/conversations').then((r) => r.data.conversations);
export const createConversation = () => api.post('/conversations').then((r) => r.data.conversation);
export const getConversation = (id) => api.get(`/conversations/${id}`).then((r) => r.data);
export const renameConversation = (id, title) => api.patch(`/conversations/${id}`, { title }).then((r) => r.data.conversation);
export const deleteConversation = (id) => api.delete(`/conversations/${id}`);

/**
 * Sends a message and streams the reply. Uses fetch (not axios) because axios can't read a stream in the browser.
 * onEvent(name, data) receives: start, title, delta, done, error.
 */
export async function streamMessage(conversationId, content, { onEvent, signal }) {
  const send = () =>
    fetch(`${API_URL}/conversations/${conversationId}/messages`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
      },
      body: JSON.stringify({ content }),
    });

  let res = await send();
  if (res.status === 401) {
    await refreshAccessToken(); // access token expired: refresh once and retry
    res = await send();
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to send message');
  }

  await readSSE(res.body, onEvent);
}
