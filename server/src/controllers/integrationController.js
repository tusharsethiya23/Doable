// HTTP handlers for /api/integrations: list connections, connect Google (OAuth), handle Google's callback, disconnect.
import { env, googleEnabled, isProd, primaryClientUrl } from '../config/env.js';
import { Integration } from '../models/Integration.js';
import { createConnectUrl, completeConnect, disconnectGoogle } from '../services/googleAuthService.js';
import { ApiError } from '../utils/ApiError.js';

const NONCE_COOKIE = 'google_oauth_nonce';
const callbackPath = new URL(env.GOOGLE_REDIRECT_URI).pathname;
const nonceCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax', // must be sent when Google redirects the browser back
  path: callbackPath,
};

export async function listIntegrations(req, res) {
  const integrations = await Integration.find({ userId: req.user._id });
  res.json({ success: true, available: { google: googleEnabled }, integrations });
}

// Returns Google's consent-screen URL; the browser then navigates there
export async function connectGoogle(req, res) {
  if (!googleEnabled) throw new ApiError(503, 'Google integration is not configured on the server');
  const { url, nonce } = createConnectUrl(req.user.id);
  res.cookie(NONCE_COOKIE, nonce, { ...nonceCookieOptions, maxAge: 10 * 60 * 1000 });
  res.json({ success: true, url });
}

// Google sends the browser here after the user approves (or cancels). Always ends with a redirect to Settings.
export async function googleCallback(req, res) {
  const back = (params) => res.redirect(`${primaryClientUrl}/settings?${new URLSearchParams(params)}`);
  const nonce = req.cookies?.[NONCE_COOKIE];
  res.clearCookie(NONCE_COOKIE, nonceCookieOptions);

  if (req.query.error) return back({ google: 'error', reason: String(req.query.error) }); // e.g. access_denied
  if (!req.query.code || !req.query.state) return back({ google: 'error', reason: 'missing_code' });

  try {
    await completeConnect({ code: String(req.query.code), state: String(req.query.state), nonce });
    back({ google: 'connected' });
  } catch (err) {
    console.error('Google connect failed:', err.message);
    back({ google: 'error', reason: err instanceof ApiError ? err.message : 'exchange_failed' });
  }
}

export async function disconnect(req, res) {
  await disconnectGoogle(req.user._id);
  res.json({ success: true });
}
