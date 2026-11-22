// Auth API calls. Each one updates the auth store so the UI reacts immediately.
import { api, refreshAccessToken } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export async function register({ name, email, password }) {
  // Send the browser's time zone so scheduling works correctly from day one
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data } = await api.post('/auth/register', { name, email, password, timezone });
  useAuthStore.getState().setSession(data);
}

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password });
  useAuthStore.getState().setSession(data);
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    useAuthStore.getState().clearSession(); // log out locally even if the request fails
  }
}

// Called once on app start: uses the refresh cookie (if any) to log the user back in
export async function restoreSession() {
  try {
    await refreshAccessToken();
  } catch {
    useAuthStore.getState().clearSession();
  }
}
