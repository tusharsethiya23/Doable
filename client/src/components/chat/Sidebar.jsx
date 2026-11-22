// Left sidebar: logo + notification bell, "New chat", page links, past conversations (rename/delete), account menu.
import { Link } from 'react-router-dom';
import Logo from '../Logo';
import NotificationBell from '../notifications/NotificationBell';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { logout } from '../../services/authService';

export default function Sidebar({ open, onClose }) {
  const { conversations, activeId, rename, remove } = useChatStore();
  const user = useAuthStore((s) => s.user);

  const onRename = (c) => {
    const title = window.prompt('Rename chat', c.title);
    if (title?.trim() && title.trim() !== c.title) rename(c.id, title.trim());
  };

  const onDelete = (c) => {
    if (window.confirm(`Delete "${c.title}"? This cannot be undone.`)) remove(c.id);
  };

  const onLogout = async () => {
    useChatStore.getState().reset();
    await logout();
  };

  return (
    <>
      {/* Dark overlay behind the sidebar on mobile */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0 dark:border-slate-800 dark:bg-slate-900 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4">
          <Logo to="/chat" />
          <NotificationBell onNavigate={onClose} />
        </div>

        <div className="px-3">
          <Link
            to="/chat"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">＋</span> New chat
          </Link>
          <Link
            to="/activity"
            onClick={onClose}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">⚡</span> Activity
          </Link>
          <Link
            to="/tasks"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">⏰</span> Reminders & tasks
          </Link>
          <Link
            to="/settings"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">⚙️</span> Settings
          </Link>
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              onClick={onClose}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span aria-hidden="true">🛡️</span> Admin
            </Link>
          )}
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Conversations">
          {conversations.length === 0 && <p className="px-2 text-sm text-slate-500">No chats yet.</p>}
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id} className="group relative">
                <Link
                  to={`/chat/${c.id}`}
                  onClick={onClose}
                  className={`block truncate rounded-lg py-2 pl-3 pr-16 text-sm ${
                    c.id === activeId
                      ? 'bg-brand-50 font-medium text-brand-700 dark:bg-slate-800 dark:text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {c.title}
                </Link>
                {/* Rename / delete buttons appear on hover (always visible on touch screens) */}
                <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                  <button onClick={() => onRename(c)} className="rounded p-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`Rename ${c.title}`}>
                    ✏️
                  </button>
                  <button onClick={() => onDelete(c)} className="rounded p-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`Delete ${c.title}`}>
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <button onClick={onLogout} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Log out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
