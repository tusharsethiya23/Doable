// Unit tests for Gmail/Calendar helpers: building emails, reading email bodies, free-slot search.
import { describe, it, expect } from 'vitest';
import { buildRawEmail, extractBody, withSignature, formatFrom, summarizeMessage } from '../../src/services/gmailService.js';
import { findFreeSlots, toEventTime } from '../../src/services/calendarService.js';
import { zonedToDate } from '../../src/utils/time.js';

const b64 = (s) => Buffer.from(s).toString('base64url');

describe('buildRawEmail', () => {
  const raw = buildRawEmail({
    from: formatFrom('Tushar "T"', 'me@gmail.com'),
    to: ['a@x.com', 'b@x.com'],
    cc: ['c@x.com'],
    subject: 'Demo moved \u{1F389}',
    body: withSignature('Hi Rahul', 'Thanks,\nTushar'),
    inReplyTo: '<orig@mail>',
    references: '<r1> <orig@mail>',
  });
  const decoded = Buffer.from(raw, 'base64url').toString();
  const [headers, body] = decoded.split('\r\n\r\n');

  it('separates headers and body with a blank line', () => {
    expect(body).toBeDefined();
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString()).toBe('Hi Rahul\n\n--\nThanks,\nTushar');
  });

  it('writes the expected headers (quotes stripped, non-ASCII subject encoded, reply threading)', () => {
    expect(headers).toContain('From: "Tushar T" <me@gmail.com>');
    expect(headers).toContain('To: a@x.com, b@x.com');
    expect(headers).toContain('Cc: c@x.com');
    expect(headers).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
    expect(headers).toContain('In-Reply-To: <orig@mail>');
    expect(headers).not.toContain('Bcc');
  });
});

describe('extractBody', () => {
  it('prefers text/plain and lists attachments', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64('Plain') } }, { mimeType: 'text/html', body: { data: b64('<b>x</b>') } }] },
        { filename: 'invoice.pdf', mimeType: 'application/pdf', body: { attachmentId: 'a' } },
      ],
    };
    expect(extractBody(payload)).toEqual({ body: 'Plain', attachments: ['invoice.pdf'] });
  });

  it('converts HTML-only emails to text', () => {
    const payload = { mimeType: 'text/html', body: { data: b64('<style>p{}</style><p>Hello&nbsp;<b>World</b></p><p>A &amp; B</p>') } };
    expect(extractBody(payload).body).toBe('Hello World\nA & B');
  });

  it('summarizes headers case-insensitively and flags unread', () => {
    const s = summarizeMessage({ id: '1', labelIds: ['UNREAD'], payload: { headers: [{ name: 'subject', value: 'Hi' }] } });
    expect(s).toMatchObject({ id: '1', subject: 'Hi', unread: true });
  });
});

describe('calendar helpers', () => {
  const tz = 'Asia/Kolkata';
  const d = (s) => zonedToDate(s, tz);

  it('builds API event times for timed and all-day events', () => {
    expect(toEventTime('2026-11-23T15:00', tz)).toEqual({ dateTime: '2026-11-23T09:30:00.000Z', timeZone: tz });
    expect(toEventTime('2026-11-23', tz)).toEqual({ date: '2026-11-23' });
  });

  it('finds free slots inside working hours, merging overlapping busy blocks', () => {
    const slots = findFreeSlots({
      busy: [
        { start: d('2026-11-23T10:00'), end: d('2026-11-23T11:00') },
        { start: d('2026-11-23T10:30'), end: d('2026-11-23T12:00') },
        { start: d('2026-11-23T15:00'), end: d('2026-11-23T15:20') },
      ],
      rangeStart: d('2026-11-23T08:00'),
      rangeEnd: d('2026-11-23T23:00'),
      durationMinutes: 30,
      timeZone: tz,
      workingHours: { start: '09:00', end: '18:00' },
    });
    expect(slots.map((s) => [s.start.getTime(), s.end.getTime()])).toEqual([
      [d('2026-11-23T09:00').getTime(), d('2026-11-23T10:00').getTime()],
      [d('2026-11-23T12:00').getTime(), d('2026-11-23T15:00').getTime()],
      [d('2026-11-23T15:20').getTime(), d('2026-11-23T18:00').getTime()],
    ]);
  });
});
