// API calls for the logged-in user's profile; keeps the auth store's user in sync.
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

// fields: { name?, timezone?, signature? }
export async function updateProfile(fields) {
  const { data } = await api.patch('/users/me', fields);
  useAuthStore.getState().setUser(data.user);
  return data.user;
}
