// Activity page (/activity): a log of every action the agent performed, with status filter, details and "Load more".
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Spinner from '../components/Spinner';
import { listActivity } from '../services/activityService';
import { getErrorMessage } from '../lib/api';
import { toolLabel } from '../lib/toolLabels';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'success', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Waiting' },
  { value: 'rejected', label: 'Rejected' },
];

// Badge colour + text for each action status
const grey = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
const STATUS = {
  success: { label: 'Succeeded', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
  pending: { label: 'Waiting for approval', className: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' },
  approved: { label: 'Approved', className: grey },
  running: { label: 'Running', className: grey },
  rejected: { label: 'Rejected', className: grey },
  expired: { label: 'Not approved', className: grey },
};

// Pretty-prints JSON strings, leaves other text as is
const pretty = (value) => {
  if (value == null) return '';
  if (typeof value !== 'string') return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const formatTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Activity() {
  const [status, setStatus] = useState('');
  const [actions, setActions] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load the first page (or the next page when `before` is given)
  const load = useCallback(
    async (before) => {
      setLoading(true);
      setError('');
      try {
        const data = await listActivity({ ...(status && { status }), ...(before && { before }) });
        setActions((prev) => (before ? [...prev, ...data.actions] : data.actions));
        setHasMore(data.hasMore);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [status]
  );

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
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="mt-1 text-sm text-slate-500">Every action your assistant has taken for you.</p>

        <div className="mt-6 flex gap-2" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === f.value ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {actions.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{toolLabel(a.toolName, a.status)}</p>
                    <p className="text-xs text-slate-500">
                      {formatTime(a.createdAt)} · {a.durationMs ?? 0} ms · {a.type === 'write' ? 'Action' : 'Lookup'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[a.status]?.className ?? grey}`}>
                    {STATUS[a.status]?.label ?? a.status}
                  </span>
                  <span className="text-slate-400 transition group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                </summary>
                <div className="space-y-3 border-t border-slate-200 p-4 text-xs dark:border-slate-800">
                  <div>
                    <p className="mb-1 font-medium text-slate-500">Input</p>
                    <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-950">{pretty(a.input) || '{}'}</pre>
                  </div>
                  {a.editedInput && (
                    <div>
                      <p className="mb-1 font-medium text-slate-500">Your edited version</p>
                      <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-950">{pretty(a.editedInput)}</pre>
                    </div>
                  )}
                  {(a.output || a.error) && (
                    <div>
                      <p className="mb-1 font-medium text-slate-500">{a.status === 'success' ? 'Result' : 'Error'}</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 dark:bg-slate-950">{pretty(a.output ?? a.error)}</pre>
                    </div>
                  )}
                  {a.conversationId && (
                    <Link to={`/chat/${a.conversationId}`} className="inline-block font-medium text-brand-600 hover:underline">
                      Open conversation →
                    </Link>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>

        {loading && (
          <div className="mt-6 flex justify-center">
            <Spinner className="size-6 text-brand-600" />
          </div>
        )}
        {!loading && actions.length === 0 && !error && <p className="mt-10 text-center text-sm text-slate-500">No activity yet.</p>}
        {!loading && hasMore && (
          <div className="mt-6 flex justify-center">
            <button onClick={() => load(actions.at(-1).createdAt)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
              Load more
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
