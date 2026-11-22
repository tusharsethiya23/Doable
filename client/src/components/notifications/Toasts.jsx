// Pop-ups in the bottom-right corner for new notifications (reminders, finished tasks…). Click to open, × to dismiss.
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';

export default function Toasts() {
  const { toasts, dismissToast, markRead } = useNotificationStore();
  const navigate = useNavigate();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              markRead([t.id]);
              dismissToast(t.id);
              if (t.link) navigate(t.link);
            }}
          >
            <p className="truncate text-sm font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.body}</p>}
          </button>
          <button onClick={() => dismissToast(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
