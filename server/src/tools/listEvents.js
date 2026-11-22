// Tool: list_events — lists the user's Google Calendar events in a time range (default: next 7 days).
import { z } from 'zod';
import { withCalendar, summarizeEvent, CALENDAR_SCOPES } from '../services/calendarService.js';
import { zonedToDate } from '../utils/time.js';
import { dateTime } from './calendarSchemas.js';

export default {
  name: 'list_events',
  description:
    "List events on the user's Google Calendar. Call this when the user asks what's on their calendar or schedule (today, tomorrow, this week), or to find an event before updating or cancelling it.",
  type: 'read',
  integration: 'google',
  scopes: CALENDAR_SCOPES,
  inputSchema: z.object({
    from: dateTime('Start of the range').optional().describe('Start of the range (local time). Default: now.'),
    to: dateTime('End of the range').optional().describe('End of the range (local time). Default: 7 days after the start.'),
    query: z.string().max(200).optional().describe('Optional text to search for in event titles, descriptions, locations or attendees.'),
    maxResults: z.number().int().min(1).max(50).default(20),
  }),

  async run({ from, to, query, maxResults }, { user }) {
    const tz = user.timezone;
    const timeMin = from ? zonedToDate(from, tz) : new Date();
    const timeMax = to ? zonedToDate(to, tz) : new Date(timeMin.getTime() + 7 * 24 * 3600 * 1000);

    return withCalendar(user, async ({ calendar }) => {
      const { data } = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true, // expand recurring events into individual occurrences
        orderBy: 'startTime',
        maxResults,
        ...(query && { q: query }),
      });
      return { timeZone: tz, count: data.items?.length || 0, events: (data.items || []).map((e) => summarizeEvent(e, tz)) };
    });
  },
};
