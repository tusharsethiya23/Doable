// API tests: registration, login, sessions, validation, admin role and disabled accounts.
import { describe, it, expect } from 'vitest';
import { api, createUser } from '../helpers.js';
import { User } from '../../src/models/User.js';

describe('auth', () => {
  it('registers, logs in, refreshes and logs out', async () => {
    const reg = await api().post('/api/auth/register').send({ name: 'Asha', email: 'Asha@Test.com', password: 'password123' });
    expect(reg.status).toBe(201);
    expect(reg.body.user).toMatchObject({ email: 'asha@test.com', role: 'user' });
    expect(reg.body.user.passwordHash).toBeUndefined();

    const login = await api().post('/api/auth/login').send({ email: 'asha@test.com', password: 'password123' });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/);

    const refreshed = await api().post('/api/auth/refresh').set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    const me = await api().get('/api/users/me').set('Authorization', `Bearer ${refreshed.body.accessToken}`);
    expect(me.body.usage).toMatchObject({ spentUsd: 0, budgetUsd: 5 });
  });

  it('rejects bad input, duplicates and wrong passwords', async () => {
    expect((await api().post('/api/auth/register').send({ name: 'A', email: 'x', password: '1' })).status).toBe(400);
    await createUser({ email: 'dup@test.com' });
    expect((await api().post('/api/auth/register').send({ name: 'Dup', email: 'dup@test.com', password: 'password123' })).status).toBe(409);
    const wrong = await api().post('/api/auth/login').send({ email: 'dup@test.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe('Invalid email or password');
  });

  it('protects routes and blocks role changes through the profile', async () => {
    expect((await api().get('/api/users/me')).status).toBe(401);
    const { auth } = await createUser();
    expect((await api().patch('/api/users/me').set(auth).send({ role: 'admin' })).status).toBe(400);
    expect((await api().patch('/api/users/me').set(auth).send({ timezone: 'Mars/Base' })).status).toBe(400);
  });

  it('gives the admin role to ADMIN_EMAILS and blocks disabled accounts', async () => {
    const admin = await createUser({ email: 'admin@test.com' });
    expect(admin.user.role).toBe('admin');

    const { user, auth, password } = await createUser();
    await User.updateOne({ _id: user.id }, { disabled: true });
    expect((await api().get('/api/users/me').set(auth)).status).toBe(403);
    expect((await api().post('/api/auth/login').send({ email: user.email, password })).status).toBe(403);
  });
});
