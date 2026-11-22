// Settings "Danger zone": permanently delete the account (SRS FR-1.7).
// Asks for the password — or, for accounts created with Google sign-in (no password), the email typed out.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../Spinner';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { deleteAccount } from '../../services/userService';
import { getErrorMessage } from '../../lib/api';

export default function DangerZone() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const usesPassword = user.authProvider !== 'google';

  async function onDelete(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      useChatStore.getState().reset();
      await deleteAccount(usesPassword ? { password: value } : { confirmEmail: value });
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-300 bg-white p-5 dark:border-red-500/40 dark:bg-slate-900">
      <p className="font-medium">Delete account</p>
      <p className="mt-1 text-sm text-slate-500">
        Permanently deletes your chats, reminders, activity history and Google connection. This cannot be undone.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10">
          Delete my account…
        </button>
      ) : (
        <form onSubmit={onDelete} className="mt-4 space-y-3">
          <label htmlFor="delete-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {usesPassword ? 'Enter your password to confirm' : `Type your email (${user.email}) to confirm`}
          </label>
          <input
            id="delete-confirm"
            type={usesPassword ? 'password' : 'email'}
            autoComplete={usesPassword ? 'current-password' : 'off'}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-950"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={busy || !value} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
              {busy && <Spinner className="size-4" />}
              Delete permanently
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
