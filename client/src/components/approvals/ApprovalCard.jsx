// Approval card (SRS FR-5): shows exactly what an action will do, with Approve / Edit / Reject.
// Emails and new events can be edited before approving; the card expires after 15 minutes.
import { useEffect, useState } from 'react';
import Spinner from '../Spinner';
import EmailEditor from './EmailEditor';
import EventEditor from './EventEditor';
import { useChatStore } from '../../store/chatStore';

const EDITORS = { send_email: EmailEditor, create_event: EventEditor };

// Re-renders every 30s so the "expires in" text stays current
function useMinutesLeft(expiresAt) {
  const calc = () => Math.ceil((new Date(expiresAt) - Date.now()) / 60000);
  const [minutes, setMinutes] = useState(calc);
  useEffect(() => {
    const timer = setInterval(() => setMinutes(calc()), 30000);
    return () => clearInterval(timer);
  });
  return minutes;
}

const DECIDED_TEXT = {
  approved: { text: 'Approved — working on it…', className: 'text-emerald-700 dark:text-emerald-300' },
  rejected: { text: 'Rejected — nothing was done.', className: 'text-slate-500' },
  expired: { text: 'Expired — nothing was done.', className: 'text-slate-500' },
};

export default function ApprovalCard({ action }) {
  const decide = useChatStore((s) => s.decide);
  const [editing, setEditing] = useState(false);
  const minutesLeft = useMinutesLeft(action.expiresAt);
  const Editor = EDITORS[action.toolName];
  const isPending = action.status === 'pending';
  const timedOut = isPending && minutesLeft <= 0;

  const submit = async (decision, input) => {
    try {
      await decide(action.id, decision, input);
      setEditing(false);
    } catch {
      // error is shown on the card (from the store)
    }
  };

  return (
    <section
      aria-label={`Approval needed: ${action.preview?.title}`}
      className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${isPending ? 'border-amber-400/70' : 'border-slate-200 dark:border-slate-800'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{action.preview?.title}</h3>
        {isPending && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {timedOut ? 'Expired' : `Needs your approval · ${minutesLeft} min left`}
          </span>
        )}
      </div>

      {editing && Editor ? (
        <div className="mt-4">
          <Editor input={action.editedInput ?? action.input} saving={action.submitting} onCancel={() => setEditing(false)} onSave={(input) => submit('approve', input)} />
        </div>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          {(action.preview?.fields || []).map((f) => (
            <div key={f.label} className={f.long ? '' : 'flex gap-3'}>
              <dt className={`shrink-0 text-slate-500 ${f.long ? 'mb-1' : 'w-24'}`}>{f.label}</dt>
              <dd className={f.long ? 'max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-slate-950' : 'min-w-0 break-words'}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {action.error && <p className="mt-3 text-sm text-red-600">{action.error}</p>}

      {isPending && !editing && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {action.submitting && <Spinner className="size-5 self-center text-brand-600" />}
          <button
            onClick={() => submit('reject')}
            disabled={action.submitting}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Reject
          </button>
          {Editor && !timedOut && (
            <button
              onClick={() => setEditing(true)}
              disabled={action.submitting}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => submit('approve')}
            disabled={action.submitting || timedOut}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Approve
          </button>
        </div>
      )}

      {DECIDED_TEXT[action.status] && <p className={`mt-3 text-sm font-medium ${DECIDED_TEXT[action.status].className}`}>{DECIDED_TEXT[action.status].text}</p>}
    </section>
  );
}
