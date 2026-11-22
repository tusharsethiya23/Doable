// Bar chart of messages sent per day (last 14 days). One series, so no legend — the title names it.
// Thin bars with rounded tops anchored to the baseline, a hover/focus tooltip per bar, and a table view for screen readers.
const shortDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function MessagesChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <figcaption className="text-sm font-semibold text-slate-900 dark:text-slate-100">Messages per day</figcaption>
      <p className="text-xs text-slate-500 dark:text-slate-400">Last 14 days · peak {max}</p>

      {/* Bars (hidden from screen readers: the table below carries the same data) */}
      <div className="mt-4 flex h-40 items-end gap-0.5 border-b border-slate-200 dark:border-slate-700" aria-hidden="true">
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
            {/* The hover target is the full column, bigger than the bar itself */}
            <div
              className="w-full max-w-6 rounded-t-[4px] bg-brand-500 transition-opacity group-hover:opacity-80 dark:bg-brand-500"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
            />
            <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block dark:bg-slate-100 dark:text-slate-900">
              {shortDay(d.day)}: <span className="font-semibold tabular-nums">{d.count}</span> messages
            </div>
          </div>
        ))}
      </div>
      {/* Sparse axis labels: first, middle, last day */}
      <div className="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400" aria-hidden="true">
        <span>{shortDay(data[0].day)}</span>
        <span>{shortDay(data[Math.floor(data.length / 2)].day)}</span>
        <span>{shortDay(data.at(-1).day)}</span>
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-500 dark:text-slate-400">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Messages</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1">{shortDay(d.day)}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
