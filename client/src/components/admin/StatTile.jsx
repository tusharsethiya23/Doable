// A single headline number with a label (and optional small note underneath), used on the admin dashboard.
export default function StatTile({ label, value, note, tone }) {
  // tone = 'critical' marks a bad value; it always comes with words in `note`, never color alone
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {note && <p className={`mt-1 text-xs ${tone === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>{note}</p>}
    </div>
  );
}
