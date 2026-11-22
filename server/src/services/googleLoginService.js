// "Sign in with Google" (SRS FR-1.2): log in or sign up with a Google account.
// Separate from connecting Gmail/Calendar: it only asks for basic profile scopes and doesn't keep Google's tokens —
// we just use Google's verified identity, then issue our own session as with a password login.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { createOAuthClient, LOGIN_SCOPES, loginRedirectUri } from '../config/google.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { applyAdminRole } from './authService.js';

const STATE_AUDIENCE = 'google-login';

/**
 * Step 1: Google's sign-in URL. `state` is signed (can't be forged); `nonce` also goes in a cookie so the
 * callback only works in the browser that started it (blocks login CSRF).
 */
export function createLoginUrl() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = jwt.sign({ nonce }, env.JWT_ACCESS_SECRET, { expiresIn: '10m', audience: STATE_AUDIENCE });
  const url = createOAuthClient().generateAuthUrl({
    scope: LOGIN_SCOPES,
    state,
    redirect_uri: loginRedirectUri(),
    prompt: 'select_account', // let the user pick which Google account
  });
  return { url, nonce };
}

/**
 * Step 2: Google redirected back with a code → verify it, then find, link or create the user.
 * Throws ApiError whose message is a short reason code shown on the login page.
 */
export async function completeLogin({ code, state, nonce }) {
  let payload;
  try {
    payload = jwt.verify(state, env.JWT_ACCESS_SECRET, { audience: STATE_AUDIENCE });
  } catch {
    throw new ApiError(400, 'invalid_state');
  }
  if (!nonce || payload.nonce !== nonce) throw new ApiError(400, 'browser_mismatch');

  const client = createOAuthClient();
  const { tokens } = await client.getToken({ code, redirect_uri: loginRedirectUri() });
  const profile = (await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID })).getPayload();
  // Only trust emails Google has verified — otherwise someone could claim another person's address
  if (!profile?.email || !profile.email_verified) throw new ApiError(400, 'email_not_verified');

  const email = profile.email.toLowerCase();
  let user = (await User.findOne({ googleId: profile.sub })) || (await User.findOne({ email }));
  if (user?.disabled) throw new ApiError(403, 'disabled');

  if (!user) {
    // New user: account without a password (they always sign in with Google)
    user = await User.create({ name: (profile.name || email.split('@')[0]).slice(0, 80), email, authProvider: 'google', googleId: profile.sub });
  } else if (!(await User.exists({ _id: user._id, googleId: profile.sub }))) {
    // Existing account with the same (verified) email: link Google so either login method works
    await User.updateOne({ _id: user._id }, { googleId: profile.sub });
  }

  await applyAdminRole(user);
  return User.findById(user._id).select('+tokenVersion'); // tokenVersion is needed to sign the session
}
