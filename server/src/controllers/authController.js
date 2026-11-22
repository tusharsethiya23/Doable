// HTTP handlers for /api/auth: email/password auth, session refresh/logout, and "Sign in with Google".
import { registerUser, loginUser, refreshSession, issueTokens } from '../services/authService.js';
import { createLoginUrl, completeLogin } from '../services/googleLoginService.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie, signRefreshToken } from '../utils/tokens.js';
import { env, googleEnabled, isProd, primaryClientUrl } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logError } from '../utils/logger.js';

export async function register(req, res) {
  const user = await registerUser(req.body);
  res.status(201).json({ success: true, user, accessToken: issueTokens(res, user) });
}

export async function login(req, res) {
  const user = await loginUser(req.body);
  res.json({ success: true, user, accessToken: issueTokens(res, user) });
}

// Called by the client when its access token expires (or on page load) to get a new one
export async function refresh(req, res) {
  const user = await refreshSession(req.cookies?.[REFRESH_COOKIE]);
  res.json({ success: true, user, accessToken: issueTokens(res, user) });
}

export async function logout(_req, res) {
  clearRefreshCookie(res);
  res.json({ success: true });
}

// ---------- Sign in with Google ----------

const LOGIN_NONCE_COOKIE = 'google_login_nonce';
const nonceCookieOptions = {
  httpOnly: true,
  secure: isProd || env.CROSS_SITE_COOKIES,
  sameSite: env.CROSS_SITE_COOKIES ? 'none' : 'lax', // sent on Google's redirect back (top-level navigation)
  path: '/api/auth/google/callback',
};
const toLogin = (res, reason) => res.redirect(`${primaryClientUrl}/login?${new URLSearchParams({ error: reason })}`);

// GET /api/auth/google — the "Continue with Google" button navigates here; we send the browser to Google
export async function googleStart(_req, res) {
  if (!googleEnabled) return toLogin(res, 'google_unavailable');
  const { url, nonce } = createLoginUrl();
  res.cookie(LOGIN_NONCE_COOKIE, nonce, { ...nonceCookieOptions, maxAge: 10 * 60 * 1000 });
  res.redirect(url);
}

// GET /api/auth/google/callback — Google sends the browser back here. On success we set the session cookie
// and open the app (which restores the session from that cookie); on failure we go back to /login with a reason.
export async function googleCallback(req, res) {
  const nonce = req.cookies?.[LOGIN_NONCE_COOKIE];
  res.clearCookie(LOGIN_NONCE_COOKIE, nonceCookieOptions);

  if (req.query.error) return toLogin(res, String(req.query.error)); // e.g. access_denied (user cancelled)
  if (!req.query.code || !req.query.state) return toLogin(res, 'missing_code');

  try {
    const user = await completeLogin({ code: String(req.query.code), state: String(req.query.state), nonce });
    setRefreshCookie(res, signRefreshToken(user));
    res.redirect(`${primaryClientUrl}/chat`);
  } catch (err) {
    if (!(err instanceof ApiError)) logError('Google sign-in failed', err);
    toLogin(res, err instanceof ApiError ? err.message : 'google_failed');
  }
}
