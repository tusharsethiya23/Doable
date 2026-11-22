// Shown in the chat when a tool needs an account the user hasn't connected (FR-2.6): one click starts Google sign-in.
import { useState } from 'react';
import GoogleIcon from '../GoogleIcon';
import Spinner from '../Spinner';
import { connectGoogle } from '../../services/integrationService';
import { getErrorMessage } from '../../lib/api';

export default function ConnectCard({ provider }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (provider !== 'google') return null;

  const onConnect = async () => {
    setLoading(true);
    try {
      await connectGoogle(); // navigates away to Google
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
      <div className="flex-1 text-sm">
        <p className="font-medium">Connect your Google account</p>
        <p className="text-slate-500">
          So I can help with your email and calendar. You approve every email and event change first. (Already connected? Reconnect to grant new permissions.)
        </p>
        {error && <p className="mt-1 text-red-600">{error}</p>}
      </div>
      <button
        onClick={onConnect}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        {loading ? <Spinner className="size-4" /> : <GoogleIcon />}
        Connect Google
      </button>
    </div>
  );
}
