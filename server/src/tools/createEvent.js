// Tool: create_event — books an event on the user's Google Calendar (optionally with a Meet link and invites).
// type 'write' → the user approves it on a card first; preview() builds what that card shows.
import { z } from 'zod';
import { withCalendar, buildEventBody, summarizeEvent, CALENDAR_SCOPES } from '../services/calendarService.js';
import { zonedToDate, formatInZone, isDateOnly } from '../utils/time.js';
import { dateTime, attendees } from './calendarSchemas.js';

const inputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).describe('Event title.'),
    start: dateTime('Start'),
    end: dateTime('End (for all-day events, the day AFTER the last day)'),
    description: z.string().max(5000).optional().describe('Agenda or notes.'),
    location: z.string().max(300).optional(),
    attendees: attendees.optional(),
    addMeetLink: z.boolean().default(false).describe('Add a Google Meet video link.'),
    sendInvites: z.boolean().default(true).describe('Email invitations to attendees.'),
  })
  .refine((v) => isDateOnly(v.start) === isDateOnly(v.end), { message: 'start and end must both be dates or both be date-times', path: ['end'] })
  .refine((v) => v.end > v.start, { message: 'end must be after start', path: ['end'] });

const when = (input, tz) =>
  isDateOnly(input.start)
    ? `${input.start} (all day)`
    : `${formatInZone(zonedToDate(input.start, tz), tz)} → ${formatInZone(zonedToDate(input.end, tz), tz)}`;

export default {
  name: 'create_event',
  description:
    "Create an event on the user's Google Calendar, optionally inviting attendees and adding a Google Meet link. Call this when the user asks to book, schedule or add a meeting/event. Check availability first when timing is flexible. The user approves the details before it is created.",
  type: 'write',
  integration: 'google',
  scopes: CALENDAR_SCOPES,
  inputSchema,

  async preview(input, { user }) {
    return {
      title: 'Create calendar event',
      fields: [
        { label: 'Title', value: input.title },
        { label: 'When', value: when(input, user.timezone) },
        input.attendees?.length && { label: 'Guests', value: input.attendees.join(', ') },
        input.location && { label: 'Location', value: input.location },
        input.addMeetLink && { label: 'Video', value: 'Google Meet link' },
        input.attendees?.length && { label: 'Invitations', value: input.sendInvites ? 'Will be emailed' : 'Not sent' },
        input.description && { label: 'Notes', value: input.description, long: true },
      ].filter(Boolean),
    };
  },

  async run(input, { user }) {
    return withCalendar(user, async ({ calendar }) => {
      const { data } = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: buildEventBody(input, user.timezone),
        conferenceDataVersion: input.addMeetLink ? 1 : 0, // needed for the Meet link to be created
        sendUpdates: input.sendInvites ? 'all' : 'none',
      });
      return { created: true, event: summarizeEvent(data, user.timezone) };
    });
  },
};
