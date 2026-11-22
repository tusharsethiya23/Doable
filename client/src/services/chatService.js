// API calls for conversations and approvals, plus the streaming requests (send a message / continue after approval).
import { api, refreshAccessToken } from '../lib/api';
import { readSSE } from '../lib/sse';
import { API_URL } from '../config';
import { useAuthStore } from '../store/authStore';

export const listConversations = () => api.get('/conversations').then((r) => r.data.conversations);
export const createConversation = () => api.post('/conversations').then((r) => r.data.conversation);
export const getConversation = (id) => api.get(`/conversations/${id}`).then((r) => r.data);
export const renameConversation = (id, title) => api.patch(`/conversations/${id}`, { title }).then((r) => r.data.conversation);
export const deleteConversation = (id) => api.delete(`/conversations/${id}`);

// Approve or reject an approval card; `input` = the user's edited version (approve only)
export const decideAction = (actionId, decision, input) =>
  api.post(`/actions/${actionId}/decision`, { decision, ...(input && { input }) }).then((r) => r.data);

/**
 * POSTs to a streaming endpoint and feeds each Server-Sent Event to onEvent(name, data).
 * Uses fetch (not axios) because axios can't read a stream in the browser.
 */
async function streamRequest(path, body, { onEvent, signal }) {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
      },
      body: JSON.stringify(body),
    });

  let res = await send();
  if (res.status === 401) {
    await refreshAccessToken(); // access token expired: refresh once and retry
    res = await send();
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Request failed');
  }

  await readSSE(res.body, onEvent);
}

// Sends a message and streams the agent's reply
export const streamMessage = (conversationId, content, opts) => streamRequest(`/conversations/${conversationId}/messages`, { content }, opts);

// After approval cards are decided: runs approved actions and streams the rest of the reply
export const continueConversation = (conversationId, opts) => streamRequest(`/conversations/${conversationId}/continue`, {}, opts);
