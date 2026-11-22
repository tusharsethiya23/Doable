// Settings card: this month's estimated AI spend against the user's monthly budget.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function UsageCard() {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    api.get('/users/me/usage').then((r) => setUsage(r.data.usage)).catch(() => {});
  }, []);

  if (!usage) return null;
  const pct = Math.min(100, (usage.spentUsd / (usage.budgetUsd || 1)) * 100);
  const reached = usage.spentUsd >= usage.budgetUsd;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">AI usage this month</p>
        <p className="text-sm tabular-nums">
          ${usage.spentUsd.toFixed(2)} <span className="text-slate-500">of ${usage.budgetUsd.toFixed(2)}</span>
        </p>
      </div>
      <div
        className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of monthly AI budget used"
      >
        <div className={`h-full rounded-full ${reached ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {reached ? '⚠ Limit reached — the assistant is paused until the 1st of next month.' : 'Resets on the 1st of each month. Estimated from tokens used.'}
      </p>
    </div>
  );
}
