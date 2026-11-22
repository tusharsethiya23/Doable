// Shared Zod pieces for calendar tools: date-time strings in the user's local time, and attendee lists.
import { z } from 'zod';
import { DATE_TIME_REGEX } from '../utils/time.js';

export const dateTime = (what) =>
  z
    .string()
    .regex(DATE_TIME_REGEX, 'Use YYYY-MM-DDTHH:mm (or YYYY-MM-DD for all-day)')
    .describe(`${what} in the user's local time, e.g. 2026-11-23T15:00 (no time zone offset). Use YYYY-MM-DD for all-day events.`);

export const attendees = z.array(z.string().trim().email()).max(50).describe('Guest email addresses (exact; never guessed).');
