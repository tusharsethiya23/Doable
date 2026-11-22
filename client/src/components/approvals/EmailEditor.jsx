// Edit form for an email on an approval card (send_email): recipients, subject and message.
import { useState } from 'react';

const toList = (text) => text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950';

export default function EmailEditor({ input, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    to: (input.to || []).join(', '),
    cc: (input.cc || []).join(', '),
    bcc: (input.bcc || []).join(', '),
    subject: input.subject || '',
    body: input.body || '',
  });
  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...input, // keeps replyToMessageId for replies
      to: toList(form.to),
      cc: form.cc.trim() ? toList(form.cc) : undefined,
      bcc: form.bcc.trim() ? toList(form.bcc) : undefined,
      subject: form.subject.trim() || undefined,
      body: form.body,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {[
        ['to', 'To'],
        ['cc', 'Cc'],
        ['bcc', 'Bcc'],
        ['subject', 'Subject'],
      ].map(([name, label]) => (
        <label key={name} className="block text-xs font-medium text-slate-500">
          {label}
          <input name={name} value={form[name]} onChange={onChange} required={name === 'to'} className={`mt-1 ${inputClass}`} />
        </label>
      ))}
      <label className="block text-xs font-medium text-slate-500">
        Message
        <textarea name="body" rows={8} value={form.body} onChange={onChange} required className={`mt-1 ${inputClass}`} />
      </label>
      <EditorButtons saving={saving} onCancel={onCancel} />
    </form>
  );
}

export function EditorButtons({ saving, onCancel }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
        Cancel
      </button>
      <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
        Save & approve
      </button>
    </div>
  );
}
