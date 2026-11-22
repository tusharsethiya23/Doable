// Gmail helpers used by the email tools: authenticated client, message parsing, and building raw emails to send.
import { gmail as gmailApi } from '@googleapis/gmail';
import { getGoogleAuth, markGoogleExpired } from './googleAuthService.js';
import { IntegrationError } from '../utils/ApiError.js';

const MAX_BODY_CHARS = 15000; // keep long emails from flooding the AI's context

/**
 * Runs fn({ gmail, integration }) with an authenticated Gmail client,
 * converting Google auth/permission failures into IntegrationError (→ "Connect Google" button in the UI).
 */
export async function withGmail(user, requiredScopes, fn) {
  const { client, integration } = await getGoogleAuth(user, requiredScopes);
  try {
    return await fn({ gmail: gmailApi({ version: 'v1', auth: client }), integration });
  } catch (err) {
    const googleError = err?.response?.data?.error;
    if (googleError === 'invalid_grant' || /invalid_grant/.test(err?.message || '')) {
      await markGoogleExpired(user._id);
      throw new IntegrationError('google', 'expired');
    }
    if (err?.status === 403 && /insufficient/i.test(err?.message || '')) throw new IntegrationError('google', 'missing_scopes');
    if (err?.status === 404) throw new Error('Email not found. It may have been deleted, or the id is wrong.');
    throw err;
  }
}

// ---------- Reading ----------

export const getHeader = (headers = [], name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

const decodeBase64Url = (data = '') => Buffer.from(data, 'base64url').toString('utf8');

// Very small HTML → text conversion (good enough for the AI to read an email)
export function htmlToText(html) {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// Walks the MIME tree: prefers text/plain, falls back to text/html; also lists attachment names
export function extractBody(payload) {
  let plain = '';
  let html = '';
  const attachments = [];

  const walk = (part) => {
    if (!part) return;
    if (part.filename) attachments.push(part.filename);
    else if (part.mimeType === 'text/plain' && part.body?.data && !plain) plain = decodeBase64Url(part.body.data);
    else if (part.mimeType === 'text/html' && part.body?.data && !html) html = decodeBase64Url(part.body.data);
    part.parts?.forEach(walk);
  };
  walk(payload);

  let body = plain || htmlToText(html);
  if (body.length > MAX_BODY_CHARS) body = `${body.slice(0, MAX_BODY_CHARS)}\n…[email truncated]`;
  return { body, attachments };
}

// Short summary used in search results
export function summarizeMessage(msg) {
  const headers = msg.payload?.headers;
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    snippet: msg.snippet,
    unread: (msg.labelIds || []).includes('UNREAD'),
  };
}

// ---------- Writing ----------

// Non-ASCII header values (e.g. emoji or Hindi in a subject) must be encoded
const encodeHeader = (value) => (/^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`);

/** Builds an RFC 2822 plain-text email and returns it base64url-encoded, as the Gmail API expects. */
export function buildRawEmail({ from, to, cc = [], bcc = [], subject, body, inReplyTo, references }) {
  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    cc.length && `Cc: ${cc.join(', ')}`,
    bcc.length && `Bcc: ${bcc.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    inReplyTo && `In-Reply-To: ${inReplyTo}`,
    references && `References: ${references}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean); // drop optional headers that aren't set

  const encodedBody = Buffer.from(body, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'); // 76-char lines per MIME spec
  // A blank line separates the headers from the body
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${encodedBody}`, 'utf8').toString('base64url');
}

// Adds the user's saved signature (from Settings) under the body
export const withSignature = (body, signature) => (signature?.trim() ? `${body.trimEnd()}\n\n--\n${signature.trim()}` : body);

// Formats the sender as "Name <email>"
export const formatFrom = (name, email) => `"${name.replace(/"/g, '')}" <${email}>`;

/** Looks up the email being replied to and returns the headers that keep the reply in the same thread. */
export async function getReplyContext(gmail, messageId) {
  const { data } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['Message-ID', 'References', 'Subject', 'From', 'Reply-To'],
  });
  const headers = data.payload?.headers;
  const originalId = getHeader(headers, 'Message-ID');
  const subject = getHeader(headers, 'Subject');

  return {
    threadId: data.threadId,
    inReplyTo: originalId,
    references: [getHeader(headers, 'References'), originalId].filter(Boolean).join(' '),
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
  };
}

// Shared logic for send_email and create_draft: builds the raw message (handles replies + signature)
export async function composeRaw({ gmail, integration, user, input }) {
  const reply = input.replyToMessageId ? await getReplyContext(gmail, input.replyToMessageId) : null;
  const raw = buildRawEmail({
    from: formatFrom(user.name, integration.accountEmail),
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject || reply?.subject || '(no subject)',
    body: withSignature(input.body, user.signature),
    inReplyTo: reply?.inReplyTo,
    references: reply?.references,
  });
  return { raw, threadId: reply?.threadId };
}
