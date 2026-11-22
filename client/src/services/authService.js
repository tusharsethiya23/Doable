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
// (this is also how a "Sign in with Google" login lands: the server set the cookie, then sent us to /chat)
export async function restoreSession() {
  try {
    await refreshAccessToken();
    await syncTimezoneForNewGoogleAccount();
  } catch {
    useAuthStore.getState().clearSession();
  }
}

// Accounts created with Google start in UTC (Google doesn't tell us the time zone) — use the browser's,
// but only right after sign-up so we never override a time zone the user chose in Settings
async function syncTimezoneForNewGoogleAccount() {
  const user = useAuthStore.getState().user;
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isNew = user && Date.now() - new Date(user.createdAt).getTime() < 10 * 60 * 1000;
  if (!isNew || user.authProvider !== 'google' || user.timezone !== 'UTC' || !browserTz || browserTz === 'UTC') return;
  try {
    const { data } = await api.patch('/users/me', { timezone: browserTz });
    useAuthStore.getState().setUser(data.user);
  } catch {
    // not critical — the user can set it in Settings
  }
}
