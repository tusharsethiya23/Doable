// Settings section to edit name, time zone (used for scheduling) and email signature.
import { useMemo, useState } from 'react';
import FormField from '../FormField';
import Spinner from '../Spinner';
import { useAuthStore } from '../../store/authStore';
import { updateProfile } from '../../services/userService';
import { getErrorMessage } from '../../lib/api';

export default function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({ name: user.name, timezone: user.timezone, signature: user.signature || '' });
  const [state, setState] = useState({ saving: false, saved: false, error: '' });

  // Every time zone the browser knows (make sure the current one is in the list)
  const timezones = useMemo(() => {
    const list = Intl.supportedValuesOf?.('timeZone') ?? [];
    return list.includes(form.timezone) ? list : [form.timezone, ...list];
  }, [form.timezone]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setState({ saving: true, saved: false, error: '' });
    try {
      await updateProfile(form);
      setState({ saving: false, saved: true, error: '' });
    } catch (err) {
      setState({ saving: false, saved: false, error: getErrorMessage(err) });
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900';

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <FormField label="Name" id="name" required minLength={2} value={form.name} onChange={onChange} />

      <div className="space-y-1.5">
        <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Time zone
        </label>
        <select id="timezone" name="timezone" value={form.timezone} onChange={onChange} className={inputClass}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">Used for “tomorrow at 3pm”, meetings and reminders.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signature" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Email signature
        </label>
        <textarea id="signature" name="signature" rows={3} maxLength={500} value={form.signature} onChange={onChange} placeholder={`Thanks,\n${user.name}`} className={inputClass} />
        <p className="text-xs text-slate-500">Added to the end of emails the assistant writes for you.</p>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center justify-end gap-3">
        {state.saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
        <button type="submit" disabled={state.saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          {state.saving && <Spinner className="size-4" />}
          Save changes
        </button>
      </div>
    </form>
  );
}
