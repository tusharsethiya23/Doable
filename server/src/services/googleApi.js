// Shared wrapper for every Google API call (Gmail, Calendar): gets the user's authenticated client and turns
// Google auth/permission failures into IntegrationError, so the chat shows a "Connect Google" button.
import { getGoogleAuth, markGoogleExpired } from './googleAuthService.js';
import { IntegrationError } from '../utils/ApiError.js';

/**
 * @param {object} user - logged-in user
 * @param {string[]} requiredScopes - Google permissions the call needs
 * @param {(auth: { client, integration }) => Promise<any>} fn - does the actual API work
 */
export async function withGoogle(user, requiredScopes, fn) {
  const auth = await getGoogleAuth(user, requiredScopes);
  try {
    return await fn(auth);
  } catch (err) {
    const message = err?.message || '';
    if (err?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(message)) {
      await markGoogleExpired(user._id);
      throw new IntegrationError('google', 'expired');
    }
    if (err?.status === 403 && /insufficient/i.test(message)) throw new IntegrationError('google', 'missing_scopes');
    if (err?.status === 404 || err?.status === 410) throw new Error('Not found. It may have been deleted, or the id is wrong.');
    throw err;
  }
}
