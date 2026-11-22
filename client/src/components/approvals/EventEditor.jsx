// Edit form for a new calendar event on an approval card (create_event): title, time, guests, location, notes, Meet.
import { useState } from 'react';
import { EditorButtons } from './EmailEditor';

const toList = (text) => text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const isDateOnly = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
// <input type="datetime-local"> needs exactly "YYYY-MM-DDTHH:mm"
const toLocalInput = (v) => (v ? v.slice(0, 16) : '');
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950';

export default function EventEditor({ input, onSave, onCancel, saving }) {
  const allDay = isDateOnly(input.start);
  const [form, setForm] = useState({
    title: input.title || '',
    start: allDay ? input.start : toLocalInput(input.start),
    end: allDay ? input.end : toLocalInput(input.end),
    attendees: (input.attendees || []).join(', '),
    location: input.location || '',
    description: input.description || '',
    addMeetLink: Boolean(input.addMeetLink),
    sendInvites: input.sendInvites ?? true,
  });
  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...input,
      title: form.title,
      start: form.start,
      end: form.end,
      attendees: form.attendees.trim() ? toList(form.attendees) : undefined,
      location: form.location.trim() || undefined,
      description: form.description.trim() || undefined,
      addMeetLink: form.addMeetLink,
      sendInvites: form.sendInvites,
    });
  };

  const timeType = allDay ? 'date' : 'datetime-local';

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs font-medium text-slate-500">
        Title
        <input name="title" value={form.title} onChange={onChange} required className={`mt-1 ${inputClass}`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-500">
          Starts
          <input type={timeType} name="start" value={form.start} onChange={onChange} required className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Ends
          <input type={timeType} name="end" value={form.end} onChange={onChange} required className={`mt-1 ${inputClass}`} />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-500">
        Guests (comma-separated emails)
        <input name="attendees" value={form.attendees} onChange={onChange} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block text-xs font-medium text-slate-500">
        Location
        <input name="location" value={form.location} onChange={onChange} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block text-xs font-medium text-slate-500">
        Notes
        <textarea name="description" rows={3} value={form.description} onChange={onChange} className={`mt-1 ${inputClass}`} />
      </label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="addMeetLink" checked={form.addMeetLink} onChange={onChange} /> Add Google Meet link
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="sendInvites" checked={form.sendInvites} onChange={onChange} /> Email invitations
        </label>
      </div>
      <EditorButtons saving={saving} onCancel={onCancel} />
    </form>
  );
}
