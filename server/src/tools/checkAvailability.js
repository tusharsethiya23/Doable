// Tool: check_availability — finds free time slots for the user (and optionally other people) using Google free/busy.
import { z } from 'zod';
import { withCalendar, findFreeSlots, CALENDAR_SCOPES } from '../services/calendarService.js';
import { zonedToDate, formatInZone } from '../utils/time.js';
import { dateTime, attendees } from './calendarSchemas.js';

const MAX_SLOTS = 12;

export default {
  name: 'check_availability',
  description:
    "Find free time slots in the user's Google Calendar (and optionally other people's, if their calendars are visible). Call this before booking a meeting, or when the user asks when they are free. Returns slots in the user's local time.",
  type: 'read',
  integration: 'google',
  scopes: CALENDAR_SCOPES,
  inputSchema: z.object({
    from: dateTime('Start of the search range'),
    to: dateTime('End of the search range'),
    durationMinutes: z.number().int().min(5).max(480).default(30).describe('Length of the meeting in minutes.'),
    attendees: attendees.optional().describe("Other people's emails to check too (only works if their calendar is shared)."),
    workingHoursOnly: z.boolean().default(true).describe('Only suggest slots between 09:00 and 18:00 local time.'),
  }),

  async run(input, { user }) {
    const tz = user.timezone;
    const rangeStart = new Date(Math.max(zonedToDate(input.from, tz), Date.now())); // never suggest the past
    const rangeEnd = zonedToDate(input.to, tz);
    if (rangeEnd <= rangeStart) return { error: 'The range is in the past or empty. Pick a later end time.' };

    return withCalendar(user, async ({ calendar }) => {
      const ids = ['primary', ...(input.attendees || [])];
      const { data } = await calendar.freebusy.query({
        requestBody: {
          timeMin: rangeStart.toISOString(),
          timeMax: rangeEnd.toISOString(),
          timeZone: tz,
          items: ids.map((id) => ({ id })),
        },
      });

      // Collect everyone's busy blocks; note calendars we couldn't see
      const busy = [];
      const unavailable = [];
      for (const id of ids) {
        const cal = data.calendars?.[id];
        if (cal?.errors?.length) unavailable.push(id);
        for (const b of cal?.busy || []) busy.push({ start: new Date(b.start), end: new Date(b.end) });
      }

      const slots = findFreeSlots({
        busy,
        rangeStart,
        rangeEnd,
        durationMinutes: input.durationMinutes,
        timeZone: tz,
        workingHours: input.workingHoursOnly ? { start: '09:00', end: '18:00' } : null,
      });

      return {
        timeZone: tz,
        durationMinutes: input.durationMinutes,
        freeSlots: slots.slice(0, MAX_SLOTS).map((s) => ({ from: formatInZone(s.start, tz), until: formatInZone(s.end, tz) })),
        moreSlots: slots.length > MAX_SLOTS,
        ...(unavailable.length && { couldNotCheck: unavailable, note: "These people's calendars aren't visible; ask them to confirm." }),
      };
    });
  },
};
