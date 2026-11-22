// API tests for "Sign in with Google": the redirect to Google, CSRF protection (state + browser cookie),
// creating a new account, linking an existing one, and refusing unverified emails / disabled accounts.
// Google's OAuth client is replaced by a fake, so no real Google calls are made.
import { describe, it, expect, vi } from 'vitest';
import { api, createUser } from '../helpers.js';
import { User } from '../../src/models/User.js';

// Fake Google: the "code" we send to the callback decides which profile Google "returns"
const PROFILES = {
  'code-new': { sub: 'g-new', email: 'newperson@gmail.com', email_verified: true, name: 'New Person' },
  'code-existing': { sub: 'g-existing', email: 'existing@test.com', email_verified: true, name: 'Existing' },
  'code-unverified': { sub: 'g-x', email: 'x@test.com', email_verified: false },
  'code-admin': { sub: 'g-admin', email: 'admin@test.com', email_verified: true, name: 'Admin' },
  'code-disabled': { sub: 'g-dis', email: 'disabled@test.com', email_verified: true, name: 'Dis' },
};
vi.mock('../../src/config/google.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createOAuthClient: () => ({
    generateAuthUrl: (o) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ scope: o.scope.join(' '), state: o.state, redirect_uri: o.redirect_uri })}`,
    getToken: async ({ code }) => ({ tokens: { id_token: code } }),
    verifyIdToken: async ({ idToken }) => ({ getPayload: () => PROFILES[idToken] }),
  }),
}));

// Starts the flow like a browser: returns the state Google would echo back and the nonce cookie
async function startLogin() {
  const res = await api().get('/api/auth/google');
  const url = new URL(res.headers.location);
  return { res, url, state: url.searchParams.get('state'), cookie: res.headers['set-cookie'][0].split(';')[0] };
}

const callback = (query, cookie) => {
  const req = api().get('/api/auth/google/callback').query(query);
  return cookie ? req.set('Cookie', cookie) : req;
};

describe('Sign in with Google', () => {
  it('redirects to Google asking only for basic profile scopes', async () => {
    const { res, url } = await startLogin();
    expect(res.status).toBe(302);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/api\/auth\/google\/callback$/);
  });

  it('creates a new account and starts a session', async () => {
    const { state, cookie } = await startLogin();
    const res = await callback({ code: 'code-new', state }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/chat$/);

    // The session cookie it set works like a normal login
    const session = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0];
    const refreshed = await api().post('/api/auth/refresh').set('Cookie', session);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user).toMatchObject({ email: 'newperson@gmail.com', name: 'New Person', authProvider: 'google' });
  });

  it('links Google to an existing account with the same email (password login keeps working)', async () => {
    const existing = await createUser({ email: 'existing@test.com' });
    const { state, cookie } = await startLogin();
    expect((await callback({ code: 'code-existing', state }, cookie)).headers.location).toMatch(/\/chat$/);

    expect(await User.countDocuments({ email: 'existing@test.com' })).toBe(1);
    expect((await User.findById(existing.user.id).select('+googleId')).googleId).toBe('g-existing');
    expect((await api().post('/api/auth/login').send({ email: 'existing@test.com', password: existing.password })).status).toBe(200);
  });

  it('gives the admin role to ADMIN_EMAILS', async () => {
    const { state, cookie } = await startLogin();
    await callback({ code: 'code-admin', state }, cookie);
    expect((await User.findOne({ email: 'admin@test.com' })).role).toBe('admin');
  });

  it('refuses forged requests, other browsers, unverified emails and disabled accounts', async () => {
    let { state, cookie } = await startLogin();
    expect((await callback({ code: 'code-new', state: 'forged' }, cookie)).headers.location).toMatch(/error=invalid_state/);
    expect((await callback({ code: 'code-new', state })).headers.location).toMatch(/error=browser_mismatch/); // no cookie
    expect((await callback({ error: 'access_denied' }, cookie)).headers.location).toMatch(/error=access_denied/);

    ({ state, cookie } = await startLogin());
    expect((await callback({ code: 'code-unverified', state }, cookie)).headers.location).toMatch(/error=email_not_verified/);

    const disabled = await createUser({ email: 'disabled@test.com' });
    await User.updateOne({ _id: disabled.user.id }, { disabled: true });
    ({ state, cookie } = await startLogin());
    const res = await callback({ code: 'code-disabled', state }, cookie);
    expect(res.headers.location).toMatch(/error=disabled/);
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('refreshToken=') && !c.startsWith('refreshToken=;'))).toBeFalsy();
  });
});
