// Tasks page (/tasks): the user's reminders and scheduled tasks — next run, repeat schedule, last result,
// with Pause / Resume / Delete. New ones are created by asking the assistant in chat.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Spinner from '../components/Spinner';
import { listTasks, setTaskEnabled, deleteTask } from '../services/taskService';
import { getErrorMessage } from '../lib/api';

const LAST_STATUS = {
  success: { text: 'Last run succeeded', className: 'text-emerald-600' },
  failed: { text: 'Last run failed', className: 'text-red-600' },
  needs_approval: { text: 'Last run is waiting for your approval', className: 'text-amber-600' },
};

function TaskRow({ task, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const finished = task.state === 'done';

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (window.confirm(`Delete "${task.title}"?`)) run(() => deleteTask(task.id));
  };

  return (
    <li className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${finished || !task.enabled ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">
          {task.kind === 'reminder' ? '⏰' : '🤖'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{task.title}</p>
          {task.instruction && <p className="mt-0.5 text-sm text-slate-500">{task.instruction}</p>}
          <p className="mt-2 text-xs text-slate-500">
            {finished ? 'Finished' : !task.enabled ? 'Paused' : `Next: ${task.schedule.nextRun}`}
            {task.cron && ` · Repeats (${task.cron})`}
            {task.emailMe && ' · Also emailed'}
            {task.allowEmailToMe && ' · Emails you automatically'}
          </p>
          {LAST_STATUS[task.lastStatus] && (
            <p className={`mt-1 text-xs ${LAST_STATUS[task.lastStatus].className}`}>
              {LAST_STATUS[task.lastStatus].text}
              {task.conversationId && (
                <>
                  {' · '}
                  <Link to={`/chat/${task.conversationId}`} className="underline">
                    open
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {busy && <Spinner className="size-4 text-brand-600" />}
          {!finished && (
            <button onClick={() => run(() => setTaskEnabled(task.id, !task.enabled))} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
              {task.enabled ? 'Pause' : 'Resume'}
            </button>
          )}
          <button onClick={onDelete} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setTasks(await listTasks());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
        <Logo to="/chat" />
        <Link to="/chat" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to chat
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Reminders & tasks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create them by asking in chat, e.g. “Remind me to call Mom at 7pm” or “Every Monday at 9, email me my meetings for the week.”
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        {!tasks && !error && (
          <div className="mt-10 flex justify-center">
            <Spinner className="size-6 text-brand-600" />
          </div>
        )}
        {tasks?.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">No reminders or scheduled tasks yet.</p>}

        <ul className="mt-6 space-y-3">
          {tasks?.map((t) => (
            <TaskRow key={t.id} task={t} onChanged={load} onError={setError} />
          ))}
        </ul>
      </main>
    </div>
  );
}
