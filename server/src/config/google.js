// Google OAuth settings: the permissions (scopes) we ask for and a factory for OAuth clients.
import { OAuth2Client } from 'google-auth-library';
import { env } from './env.js';

// Narrowest scopes that cover our tools (SRS NFR-7)
export const GOOGLE_SCOPES = {
  gmailRead: 'https://www.googleapis.com/auth/gmail.readonly', // search and read emails
  gmailCompose: 'https://www.googleapis.com/auth/gmail.compose', // create drafts and send emails
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events', // view/create/edit events + free/busy
};

// Everything requested on the "Connect Google" screen (openid + email identify which account was connected)
export const CONNECT_SCOPES = ['openid', 'email', ...Object.values(GOOGLE_SCOPES)];

// "Sign in with Google" only needs to know who the user is — no Gmail/Calendar access
export const LOGIN_SCOPES = ['openid', 'email', 'profile'];

// Login uses its own callback on the same host as GOOGLE_REDIRECT_URI (add BOTH URIs in Google Cloud)
export const loginRedirectUri = () => new URL('/api/auth/google/callback', env.GOOGLE_REDIRECT_URI).href;

export function createOAuthClient() {
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
}
