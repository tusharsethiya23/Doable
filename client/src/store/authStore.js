// Global auth state (Zustand). The access token lives only in memory, never in localStorage, to limit XSS risk.
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  status: 'loading', // 'loading' | 'authenticated' | 'guest'

  // Save the user + token returned by login/register/refresh
  setSession: ({ user, accessToken }) => set({ user, accessToken, status: 'authenticated' }),

  // Forget everything (logout or expired session)
  clearSession: () => set({ user: null, accessToken: null, status: 'guest' }),

  setUser: (user) => set({ user }),
}));
