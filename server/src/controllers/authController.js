// HTTP handlers for /api/auth: read the request, call authService, send the response.
import { registerUser, loginUser, refreshSession, issueTokens } from '../services/authService.js';
import { REFRESH_COOKIE, clearRefreshCookie } from '../utils/tokens.js';

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
