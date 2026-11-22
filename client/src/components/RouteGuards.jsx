// Route guards: RequireAuth sends guests to /login; GuestOnly sends logged-in users to /chat.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status !== 'authenticated') {
    // Remember where the user wanted to go so we can return there after login
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function GuestOnly() {
  const status = useAuthStore((s) => s.status);
  return status === 'authenticated' ? <Navigate to="/chat" replace /> : <Outlet />;
}
