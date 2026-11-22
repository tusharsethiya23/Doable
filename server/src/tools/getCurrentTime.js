// Tool: get_current_time — returns the exact current date and time in the user's (or a given) time zone.
import { z } from 'zod';

const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export default {
  name: 'get_current_time',
  description:
    "Get the exact current date and time. Call this whenever the user asks what time or date it is, or before working out relative times like 'in 2 hours', 'tonight' or 'next Friday'. Defaults to the user's own time zone.",
  type: 'read', // read = no side effects, runs without confirmation
  inputSchema: z.object({
    timezone: z
      .string()
      .refine(isValidTimezone, 'Unknown IANA time zone')
      .optional()
      .describe("IANA time zone such as 'Asia/Kolkata' or 'America/New_York'. Omit to use the user's time zone."),
  }),

  async run({ timezone }, { user }) {
    const tz = timezone || user.timezone || 'UTC';
    const now = new Date();
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(now);

    return { timezone: tz, local, iso_utc: now.toISOString() };
  },
};
