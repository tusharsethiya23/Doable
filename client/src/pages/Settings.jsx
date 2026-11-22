// Settings page (/settings): profile + connected accounts. Google redirects back here with ?google=connected|error.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import Spinner from '../components/Spinner';
import ProfileForm from '../components/settings/ProfileForm';
import GoogleIntegrationCard from '../components/settings/GoogleIntegrationCard';
import UsageCard from '../components/settings/UsageCard';
import { listIntegrations } from '../services/integrationService';
import { getErrorMessage } from '../lib/api';

// Friendly text for the ?reason=... codes the server sends back after a failed Google connection
const CONNECT_ERRORS = {
  access_denied: 'You cancelled the Google sign-in.',
  browser_mismatch: 'Please start the connection again from this browser.',
  invalid_state: 'The connection link expired. Please try again.',
  no_refresh_token: 'Google didn’t grant offline access. Please try again.',
};

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await listIntegrations());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Show the result of a Google connection once, then clean the URL
  useEffect(() => {
    const result = params.get('google');
    if (!result) return;
    setBanner(
      result === 'connected'
        ? { ok: true, text: 'Google connected! Try asking: “Do I have any unread emails?”' }
        : { ok: false, text: CONNECT_ERRORS[params.get('reason')] || 'Could not connect Google. Please try again.' }
    );
    setParams({}, { replace: true });
  }, [params, setParams]);

  const google = data?.integrations.find((i) => i.provider === 'google');

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
        <Logo to="/chat" />
        <Link to="/chat" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to chat
        </Link>
      </header>

      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <h1 className="text-2xl font-semibold">Settings</h1>

        {banner && (
          <p
            role="status"
            className={`rounded-lg px-4 py-3 text-sm ${
              banner.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
            }`}
          >
            {banner.text}
          </p>
        )}

        <section aria-labelledby="integrations-heading" className="space-y-3">
          <h2 id="integrations-heading" className="text-lg font-semibold">
            Connected accounts
          </h2>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {data ? (
            <GoogleIntegrationCard integration={google} available={data.available.google} onChange={load} />
          ) : (
            !error && <Spinner className="size-6 text-brand-600" />
          )}
        </section>

        <section aria-labelledby="usage-heading" className="space-y-3">
          <h2 id="usage-heading" className="text-lg font-semibold">
            Usage
          </h2>
          <UsageCard />
        </section>

        <section aria-labelledby="profile-heading" className="space-y-3">
          <h2 id="profile-heading" className="text-lg font-semibold">
            Profile
          </h2>
          <ProfileForm />
        </section>
      </main>
    </div>
  );
}
