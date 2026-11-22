// Unit tests for pure helpers: time zones, cron schedules, encryption, cost estimates.
import { describe, it, expect } from 'vitest';
import { zonedToDate, formatInZone, isDateOnly } from '../../src/utils/time.js';
import { cronProblem, nextCronRun } from '../../src/utils/schedule.js';
import { encrypt, decrypt } from '../../src/utils/crypto.js';
import { costOfUsage } from '../../src/services/usageService.js';

describe('time zones', () => {
  it('converts local time in a zone to UTC', () => {
    expect(zonedToDate('2026-11-23T15:00', 'Asia/Kolkata').toISOString()).toBe('2026-11-23T09:30:00.000Z');
  });

  it('handles daylight saving time', () => {
    expect(zonedToDate('2026-07-01T09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z'); // EDT
    expect(zonedToDate('2026-12-01T09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z'); // EST
  });

  it('keeps an explicit offset and supports UTC', () => {
    expect(zonedToDate('2026-11-23T15:00+01:00', 'Asia/Kolkata').toISOString()).toBe('2026-11-23T14:00:00.000Z');
    expect(zonedToDate('2026-11-23T15:00', 'UTC').toISOString()).toBe('2026-11-23T15:00:00.000Z');
  });

  it('formats in the user zone and detects date-only values', () => {
    expect(formatInZone(new Date('2026-11-23T09:30:00Z'), 'Asia/Kolkata')).toMatch(/3:00 PM/);
    expect(isDateOnly('2026-11-23')).toBe(true);
    expect(isDateOnly('2026-11-23T10:00')).toBe(false);
  });
});

describe('cron schedules', () => {
  it('accepts valid schedules and rejects bad or too-frequent ones', () => {
    expect(cronProblem('0 9 * * 1-5', 'Asia/Kolkata', 60)).toBeNull();
    expect(cronProblem('every day', 'UTC', 60)).toMatch(/5 fields/);
    expect(cronProblem('*/10 * * * *', 'UTC', 60)).toMatch(/Too frequent/);
  });

  it('finds the next weekday run in the user zone', () => {
    // Sunday 22 Nov 2026 → next weekday 09:00 IST is Monday 03:30 UTC
    const next = nextCronRun('0 9 * * 1-5', 'Asia/Kolkata', new Date('2026-11-22T04:00:00Z'));
    expect(next.toISOString()).toBe('2026-11-23T03:30:00.000Z');
  });
});

describe('token encryption', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encrypt('secret-token');
    expect(decrypt(a)).toBe('secret-token');
    expect(encrypt('secret-token')).not.toBe(a);
  });

  it('detects tampering', () => {
    const parts = encrypt('secret-token').split('.');
    parts[2] = Buffer.from('tampered').toString('base64');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
});

describe('cost estimate', () => {
  it('prices tokens, cache and web searches', () => {
    // 1M input × $4 + 100k output × $20/M + 1M cache read × $0.2 + 2 searches × $0.01
    const cost = costOfUsage({
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 1_000_000,
      server_tool_use: { web_search_requests: 2 },
    });
    expect(cost).toBeCloseTo(4 + 2 + 0.2 + 0.02, 6);
  });
});
