// API tests for the admin dashboard: access control, stats, disabling users and changing budgets.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, createUser } from '../helpers.js';

describe('admin', () => {
  let admin;
  let regular;
  beforeAll(async () => {
    admin = await createUser({ email: 'admin@test.com' }); // listed in ADMIN_EMAILS (tests/setup.js)
    regular = await createUser();
  });

  it('is only available to admins', async () => {
    expect((await api().get('/api/admin/stats').set(regular.auth)).status).toBe(403);
    expect((await api().get('/api/admin/stats')).status).toBe(401);
  });

  it('returns platform stats', async () => {
    const res = await api().get('/api/admin/stats').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.stats.users.total).toBeGreaterThanOrEqual(2);
    expect(res.body.stats.messagesPerDay).toHaveLength(14);
    expect(res.body.stats.usageThisMonth).toHaveProperty('costUsd');
  });

  it('lists and searches users', async () => {
    const res = await api().get('/api/admin/users').query({ q: regular.user.email }).set(admin.auth);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).toMatchObject({ email: regular.user.email, disabled: false, monthlyBudgetUsd: null });
  });

  it('changes budgets and disables accounts (but not your own)', async () => {
    const budget = await api().patch(`/api/admin/users/${regular.user.id}`).set(admin.auth).send({ monthlyBudgetUsd: 20 });
    expect(budget.body.user.usage.budgetUsd).toBe(20);

    const reset = await api().patch(`/api/admin/users/${regular.user.id}`).set(admin.auth).send({ monthlyBudgetUsd: null });
    expect(reset.body.user.usage.budgetUsd).toBe(5);

    expect((await api().patch(`/api/admin/users/${admin.user.id}`).set(admin.auth).send({ disabled: true })).status).toBe(400);

    await api().patch(`/api/admin/users/${regular.user.id}`).set(admin.auth).send({ disabled: true });
    expect((await api().get('/api/users/me').set(regular.auth)).status).toBe(403);
    expect((await api().post('/api/auth/login').send({ email: regular.user.email, password: regular.password })).status).toBe(403);

    expect((await api().patch(`/api/admin/users/${regular.user.id}`).set(admin.auth).send({ role: 'admin' })).status).toBe(400); // can't set role
  });
});
