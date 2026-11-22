// Admin users table: search, this month's AI spend vs. budget, change the budget, disable/enable accounts.
import { useState } from 'react';
import { updateAdminUser } from '../../services/adminService';
import { getErrorMessage } from '../../lib/api';

const money = (n) => `$${Number(n).toFixed(2)}`;

function UserRow({ user, isSelf, onUpdated, onError }) {
  const [busy, setBusy] = useState(false);

  const save = async (changes) => {
    setBusy(true);
    try {
      onUpdated(await updateAdminUser(user.id, changes));
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const editBudget = () => {
    const current = user.monthlyBudgetUsd ?? '';
    const input = window.prompt(`Monthly AI budget for ${user.email} in USD (leave empty for the default):`, current);
    if (input === null) return;
    const value = input.trim() === '' ? null : Number(input);
    if (value !== null && (Number.isNaN(value) || value < 0)) return onError('Enter a number of dollars, e.g. 10');
    save({ monthlyBudgetUsd: value });
  };

  const toggleDisabled = () => {
    const verb = user.disabled ? 'Enable' : 'Disable';
    if (window.confirm(`${verb} ${user.email}?${user.disabled ? '' : ' They will be logged out and their scheduled tasks will stop.'}`)) {
      save({ disabled: !user.disabled });
    }
  };

  const pct = Math.min(100, (user.usage.spentUsd / (user.usage.budgetUsd || 1)) * 100);

  return (
    <tr className="border-t border-slate-100 align-top dark:border-slate-800">
      <td className="py-3 pr-3">
        <p className="font-medium">
          {user.name} {user.role === 'admin' && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase dark:bg-slate-800">admin</span>}
        </p>
        <p className="text-xs text-slate-500">{user.email}</p>
      </td>
      <td className="py-3 pr-3">
        <p className="tabular-nums">
          {money(user.usage.spentUsd)} <span className="text-slate-500">/ {money(user.usage.budgetUsd)}</span>
        </p>
        <div className="mt-1 h-1.5 w-28 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        {user.monthlyBudgetUsd === null && <p className="mt-0.5 text-[11px] text-slate-500">default budget</p>}
      </td>
      <td className="py-3 pr-3">
        {user.disabled ? (
          <span className="text-xs font-medium text-red-700 dark:text-red-400">✕ Disabled</span>
        ) : (
          <span className="text-xs text-slate-600 dark:text-slate-300">✓ Active</span>
        )}
      </td>
      <td className="py-3 text-right">
        <div className="flex justify-end gap-1">
          <button onClick={editBudget} disabled={busy} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800">
            Budget
          </button>
          {!isSelf && (
            <button
              onClick={toggleDisabled}
              disabled={busy}
              className={`rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50 ${user.disabled ? 'hover:bg-slate-100 dark:hover:bg-slate-800' : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10'}`}
            >
              {user.disabled ? 'Enable' : 'Disable'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function UsersTable({ users, selfId, onUpdated, onError }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-xs text-slate-500 dark:text-slate-400">
            <th className="py-3 font-medium">User</th>
            <th className="py-3 font-medium">AI spend this month</th>
            <th className="py-3 font-medium">Status</th>
            <th className="py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === selfId} onUpdated={onUpdated} onError={onError} />
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-slate-500">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
