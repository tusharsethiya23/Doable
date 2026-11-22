// Top-level routes. On first load it tries to restore the session from the refresh cookie.
// While logged in, it keeps the live notification stream open and shows notification pop-ups on every page.
import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useNotificationStore } from './store/notificationStore';
import { restoreSession } from './services/authService';
import { RequireAuth, GuestOnly } from './components/RouteGuards';
import Spinner from './components/Spinner';
import Toasts from './components/notifications/Toasts';
import Tasks from './pages/Tasks';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Chat from './pages/Chat';
import Activity from './pages/Activity';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

export default function App() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    restoreSession();
  }, []);

  // Connect notifications after login, disconnect on logout
  useEffect(() => {
    const { start, stop } = useNotificationStore.getState();
    if (status === 'authenticated') start();
    else if (status === 'guest') stop();
  }, [status]);

  // Wait until we know if the user is logged in, so protected pages don't flash
  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <>
      {status === 'authenticated' && <Toasts />}
      <Routes>
      <Route path="/" element={<Landing />} />

      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/tasks" element={<Tasks />} />
      </Route>

      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
