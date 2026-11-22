// Axios instance for the backend: adds the access token to requests and silently refreshes it on a 401.
import axios from 'axios';
import { API_URL } from '../config';
import { useAuthStore } from '../store/authStore';

export const api = axios.create({ baseURL: API_URL, withCredentials: true });

// Attach "Authorization: Bearer <token>" to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Share one refresh request if several calls fail at the same time
let refreshPromise = null;

export function refreshAccessToken() {
  refreshPromise ??= api
    .post('/auth/refresh')
    .then(({ data }) => {
      useAuthStore.getState().setSession(data);
      return data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

// On 401: refresh the token once and retry the original request; if that fails, log out
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().clearSession();
      }
    }
    return Promise.reject(error);
  }
);

// Pulls a readable message out of an API error
export const getErrorMessage = (err) =>
  err?.response?.data?.message || err?.message || 'Something went wrong';
