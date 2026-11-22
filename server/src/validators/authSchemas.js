// Zod schemas describing valid request bodies for auth and profile endpoints.
import { z } from 'zod';

// True if the string is a real IANA time zone like "Asia/Kolkata"
const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);
const email = z.string().trim().toLowerCase().email('Enter a valid email');

export const registerSchema = z.object({
  name,
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  timezone: z.string().refine(isValidTimezone, 'Invalid time zone').optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z
  .object({
    name: name.optional(),
    timezone: z.string().refine(isValidTimezone, 'Invalid time zone').optional(),
    signature: z.string().max(500).optional(),
  })
  .strict(); // reject unknown fields such as "role"
