// Admin dashboard (/admin, admins only): headline numbers, messages-per-day chart, and user management.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Spinner from '../components/Spinner';
import StatTile from '../components/admin/StatTile';
import MessagesChart from '../components/admin/MessagesChart';
import UsersTable from '../components/admin/UsersTable';
import { getAdminStats, listAdminUsers } from '../services/adminService';
import { useAuthStore } from '../store/authStore';
import { getErrorMessage } from '../lib/api';

const ERROR_RATE_ALERT = 0.1; // flag tool error rates above 10%

export default function Admin() {
  const me = useAuthStore((s) => s.user);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const loadUsers = useCallback(async (q) => {
    try {
      setUsers(await listAdminUsers(q));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (me?.role !== 'admin') return;
    getAdminStats().then(setStats).catch((err) => setError(getErrorMessage(err)));
    loadUsers();
  }, [me?.role, loadUsers]);

  // Search as you type (waits 300ms after the last key press)
  useEffect(() => {
    if (me?.role !== 'admin') return;
    const timer = setTimeout(() => loadUsers(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, me?.role, loadUsers]);

  if (me?.role !== 'admin') {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="font-semibold">Admins only</p>
          <Link to="/chat" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
            ← Back to chat
          </Link>
        </div>
      </div>
    );
  }

  const errorRate = stats?.actions7d.errorRate ?? 0;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
        <Logo to="/chat" />
        <Link to="/chat" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to chat
        </Link>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-semibold">Admin</h1>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        {!stats && !error && <Spinner className="size-6 text-brand-600" />}

        {stats && (
          <>
            <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Users" value={stats.users.total} note={`+${stats.users.new7d} new · ${stats.users.active7d} active (7 days)`} />
              <StatTile
                label="AI spend this month"
                value={`$${stats.usageThisMonth.costUsd.toFixed(2)}`}
                note={`${(stats.usageThisMonth.inputTokens / 1000).toFixed(0)}k in · ${(stats.usageThisMonth.outputTokens / 1000).toFixed(0)}k out`}
              />
              <StatTile label="Agent actions (7 days)" value={stats.actions7d.total} note={`${stats.actions7d.byStatus.pending || 0} waiting for approval`} />
              <StatTile
                label="Tool error rate (7 days)"
                value={`${(errorRate * 100).toFixed(1)}%`}
                tone={errorRate > ERROR_RATE_ALERT ? 'critical' : undefined}
                note={errorRate > ERROR_RATE_ALERT ? '⚠ Above 10% — check the logs' : `${stats.activeScheduledTasks} scheduled tasks active`}
              />
            </section>

            <MessagesChart data={stats.messagesPerDay} />
          </>
        )}

        <section aria-labelledby="users-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="users-heading" className="text-lg font-semibold">
              Users
            </h2>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search users"
              className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <UsersTable
            users={users}
            selfId={me.id}
            onError={setError}
            onUpdated={(updated) => setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)))}
          />
        </section>
      </main>
    </div>
  );
}
