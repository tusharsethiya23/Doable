// Settings card for the Google connection: shows status + account, and Connect / Reconnect / Disconnect buttons.
import { useState } from 'react';
import GoogleIcon from '../GoogleIcon';
import Spinner from '../Spinner';
import { connectGoogle, disconnectGoogle } from '../../services/integrationService';
import { getErrorMessage } from '../../lib/api';

// What each Google permission lets the assistant do (shown to the user)
const SCOPE_LABELS = {
  'https://www.googleapis.com/auth/gmail.readonly': 'Read and search your email',
  'https://www.googleapis.com/auth/gmail.compose': 'Create drafts and send email (with your approval)',
  'https://www.googleapis.com/auth/calendar.events': 'See and manage calendar events (changes need your approval)',
};
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export default function GoogleIntegrationCard({ integration, available, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = () => {
    if (!window.confirm('Disconnect Google? The assistant will no longer be able to read or send your email.')) return;
    run(async () => {
      await disconnectGoogle();
      onChange();
    });
  };

  const expired = integration?.status === 'expired';
  // Connected before Calendar support was added → needs to reconnect once to grant calendar access
  const missingCalendar = integration && !expired && !integration.scopes?.includes(CALENDAR_SCOPE);
  const permissions = (integration?.scopes || []).map((s) => SCOPE_LABELS[s]).filter(Boolean);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 dark:border-slate-700">
          <GoogleIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">Google (Gmail + Calendar)</h3>
            {integration && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  expired ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                }`}
              >
                {expired ? 'Needs reconnecting' : 'Connected'}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            {integration ? integration.accountEmail : 'Let the assistant read, draft and send email for you.'}
          </p>
          {permissions.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {permissions.map((p) => (
                <li key={p}>✓ {p}</li>
              ))}
            </ul>
          )}
          {missingCalendar && <p className="mt-2 text-xs text-amber-600">Reconnect to give the assistant access to your calendar.</p>}
          {!available && <p className="mt-2 text-xs text-amber-600">Google isn’t configured on the server yet (see docs/GOOGLE_SETUP.md).</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {busy && <Spinner className="size-5 self-center text-brand-600" />}
        {integration && (
          <button onClick={onDisconnect} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-500/10">
            Disconnect
          </button>
        )}
        {(!integration || expired || missingCalendar) && (
          <button
            onClick={() => run(connectGoogle)}
            disabled={busy || !available}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {expired || missingCalendar ? 'Reconnect' : 'Connect Google'}
          </button>
        )}
      </div>
    </div>
  );
}
