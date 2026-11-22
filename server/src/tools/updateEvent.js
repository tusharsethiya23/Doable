// Tool: update_event — changes an existing Google Calendar event (time, title, guests, etc.).
// type 'write' → approved by the user first; the preview shows "old → new" for each change.
import { z } from 'zod';
import { withCalendar, buildEventBody, summarizeEvent, describeWhen, CALENDAR_SCOPES } from '../services/calendarService.js';
import { zonedToDate, formatInZone } from '../utils/time.js';
import { dateTime, attendees } from './calendarSchemas.js';

const inputSchema = z
  .object({
    eventId: z.string().min(1).describe('Event id from list_events.'),
    title: z.string().trim().min(1).max(200).optional(),
    start: dateTime('New start').optional(),
    end: dateTime('New end').optional(),
    description: z.string().max(5000).optional(),
    location: z.string().max(300).optional(),
    attendees: attendees.optional().describe('The FULL new guest list (replaces the old one). Include existing guests you want to keep.'),
    addMeetLink: z.boolean().optional().describe('Add a Google Meet link if the event has none.'),
    notifyAttendees: z.boolean().default(true).describe('Email guests about the change.'),
  })
  .refine((v) => Boolean(v.start) === Boolean(v.end), { message: 'Give both start and end when changing the time', path: ['end'] });

export default {
  name: 'update_event',
  description:
    "Change an existing event on the user's Google Calendar (reschedule, rename, change guests, location or notes). Find the event id with list_events first. The user approves the change before it is applied.",
  type: 'write',
  integration: 'google',
  scopes: CALENDAR_SCOPES,
  inputSchema,

  // Loads the current event so the card can show what will change
  async preview(input, { user }) {
    const tz = user.timezone;
    const current = await withCalendar(user, ({ calendar }) => calendar.events.get({ calendarId: 'primary', eventId: input.eventId }).then((r) => r.data));
    const change = (label, from, to) => ({ label, value: from ? `${from} → ${to}` : to });

    return {
      title: `Update event: ${current.summary || '(no title)'}`,
      fields: [
        input.title && change('Title', current.summary, input.title),
        input.start && change('When', describeWhen(current, tz), `${formatInZone(zonedToDate(input.start, tz), tz)} → ${formatInZone(zonedToDate(input.end, tz), tz)}`),
        input.attendees && change('Guests', (current.attendees || []).map((a) => a.email).join(', ') || 'none', input.attendees.join(', ') || 'none'),
        input.location !== undefined && change('Location', current.location, input.location || '(removed)'),
        input.addMeetLink && !current.hangoutLink && { label: 'Video', value: 'Add Google Meet link' },
        input.description !== undefined && { label: 'Notes', value: input.description, long: true },
        { label: 'Notify guests', value: input.notifyAttendees ? 'Yes' : 'No' },
      ].filter(Boolean),
    };
  },

  async run({ eventId, notifyAttendees, ...changes }, { user }) {
    return withCalendar(user, async ({ calendar }) => {
      const { data } = await calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: buildEventBody(changes, user.timezone),
        conferenceDataVersion: changes.addMeetLink ? 1 : 0,
        sendUpdates: notifyAttendees ? 'all' : 'none',
      });
      return { updated: true, event: summarizeEvent(data, user.timezone) };
    });
  },
};
