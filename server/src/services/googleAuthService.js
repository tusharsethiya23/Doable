// Google account connection: builds the consent URL, handles the callback, stores tokens encrypted,
// returns ready-to-use authenticated clients (auto-refreshing), and disconnects.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { createOAuthClient, CONNECT_SCOPES } from '../config/google.js';
import { Integration } from '../models/Integration.js';
import { ApiError, IntegrationError } from '../utils/ApiError.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { logError } from '../utils/logger.js';

const STATE_AUDIENCE = 'google-oauth';

/**
 * Step 1: URL of Google's consent screen.
 * `state` is a signed token saying which user started the flow; `nonce` is also stored in a cookie so the
 * callback only works in the same browser (stops an attacker linking their Google account to your profile).
 */
export function createConnectUrl(userId) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = jwt.sign({ sub: userId, nonce }, env.JWT_ACCESS_SECRET, { expiresIn: '10m', audience: STATE_AUDIENCE });

  const url = createOAuthClient().generateAuthUrl({
    access_type: 'offline', // get a refresh token so we can act while the user is away
    prompt: 'consent', // always return a refresh token, even on reconnect
    include_granted_scopes: true,
    scope: CONNECT_SCOPES,
    state,
  });
  return { url, nonce };
}

// Step 2: Google redirected back with a one-time code → exchange it for tokens and save them
export async function completeConnect({ code, state, nonce }) {
  let payload;
  try {
    payload = jwt.verify(state, env.JWT_ACCESS_SECRET, { audience: STATE_AUDIENCE });
  } catch {
    throw new ApiError(400, 'invalid_state');
  }
  if (!nonce || payload.nonce !== nonce) throw new ApiError(400, 'browser_mismatch');

  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const accountEmail = ticket.getPayload()?.email;

  // Google only sends a refresh token on first consent; keep the old one if this is a reconnect without it
  const existing = await Integration.findOne({ userId: payload.sub, provider: 'google' }).select('+refreshTokenEnc');
  const refreshTokenEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refreshTokenEnc;
  if (!refreshTokenEnc) throw new ApiError(400, 'no_refresh_token');

  await Integration.findOneAndUpdate(
    { userId: payload.sub, provider: 'google' },
    {
      accountEmail,
      scopes: (tokens.scope || '').split(' ').filter(Boolean),
      accessTokenEnc: encrypt(tokens.access_token),
      refreshTokenEnc,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      status: 'active',
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * Returns an authenticated Google client for this user, or throws IntegrationError.
 * The client refreshes expired access tokens by itself; new tokens are saved back (encrypted).
 */
export async function getGoogleAuth(user, requiredScopes = []) {
  const integration = await Integration.findOne({ userId: user._id, provider: 'google' }).select('+accessTokenEnc +refreshTokenEnc');
  if (!integration) throw new IntegrationError('google', 'not_connected');
  if (integration.status !== 'active') throw new IntegrationError('google', 'expired');
  if (requiredScopes.some((s) => !integration.scopes.includes(s))) throw new IntegrationError('google', 'missing_scopes');

  const client = createOAuthClient();
  client.setCredentials({
    access_token: decrypt(integration.accessTokenEnc),
    refresh_token: decrypt(integration.refreshTokenEnc),
    expiry_date: integration.expiresAt?.getTime(),
  });

  client.on('tokens', (tokens) => {
    const update = {
      ...(tokens.access_token && { accessTokenEnc: encrypt(tokens.access_token) }),
      ...(tokens.refresh_token && { refreshTokenEnc: encrypt(tokens.refresh_token) }),
      ...(tokens.expiry_date && { expiresAt: new Date(tokens.expiry_date) }),
    };
    Integration.updateOne({ _id: integration._id }, update).catch((err) => logError('Saving refreshed Google token failed', err));
  });

  return { client, integration };
}

// Marks the connection as expired (refresh token revoked or invalid) so the UI asks the user to reconnect
export async function markGoogleExpired(userId) {
  await Integration.updateOne({ userId, provider: 'google' }, { status: 'expired' });
}

// Revokes access at Google (best effort) and deletes the stored tokens
export async function disconnectGoogle(userId) {
  const integration = await Integration.findOne({ userId, provider: 'google' }).select('+refreshTokenEnc');
  if (!integration) return;
  try {
    await createOAuthClient().revokeToken(decrypt(integration.refreshTokenEnc));
  } catch (err) {
    console.warn('Google token revoke failed (deleting locally anyway):', err.message);
  }
  await integration.deleteOne();
}
