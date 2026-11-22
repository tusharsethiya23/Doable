// API calls for connected accounts (Google).
import { api } from '../lib/api';

export const listIntegrations = () => api.get('/integrations').then((r) => r.data);

// Asks the server for Google's consent URL, then sends the browser there. Google returns to /settings afterwards.
export async function connectGoogle() {
  const { data } = await api.post('/integrations/google/connect');
  window.location.assign(data.url);
}

export const disconnectGoogle = () => api.delete('/integrations/google');
