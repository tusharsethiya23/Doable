// Main app screen (logged-in only). For now a placeholder with the header; the chat UI arrives in Phase 2.
import Logo from '../components/Logo';
import { useAuthStore } from '../store/authStore';
import { logout } from '../services/authService';

export default function Chat() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
        <Logo to="/chat" />
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-slate-600 sm:inline dark:text-slate-400">{user?.email}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Hi {user?.name?.split(' ')[0]} 👋</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            You’re logged in. The chat with your assistant is coming next.
          </p>
          <p className="mt-1 text-xs text-slate-500">Time zone: {user?.timezone}</p>
        </div>
      </main>
    </div>
  );
}
