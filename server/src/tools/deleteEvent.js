// Tool: delete_event — cancels an event on the user's Google Calendar (and notifies guests).
// type 'write' → approved by the user first; the preview shows which event will be cancelled.
import { z } from 'zod';
import { withCalendar, describeWhen, CALENDAR_SCOPES } from '../services/calendarService.js';

export default {
  name: 'delete_event',
  description:
    "Cancel (delete) an event on the user's Google Calendar. Find the event id with list_events first. The user approves before it is cancelled.",
  type: 'write',
  integration: 'google',
  scopes: CALENDAR_SCOPES,
  inputSchema: z.object({
    eventId: z.string().min(1).describe('Event id from list_events.'),
    notifyAttendees: z.boolean().default(true).describe('Email guests that the event is cancelled.'),
  }),

  async preview({ eventId, notifyAttendees }, { user }) {
    const event = await withCalendar(user, ({ calendar }) => calendar.events.get({ calendarId: 'primary', eventId }).then((r) => r.data));
    const guests = (event.attendees || []).map((a) => a.email);
    return {
      title: 'Cancel calendar event',
      fields: [
        { label: 'Event', value: event.summary || '(no title)' },
        { label: 'When', value: describeWhen(event, user.timezone) },
        guests.length && { label: 'Guests', value: guests.join(', ') },
        guests.length && { label: 'Notify guests', value: notifyAttendees ? 'Yes, they will get a cancellation email' : 'No' },
      ].filter(Boolean),
    };
  },

  async run({ eventId, notifyAttendees }, { user }) {
    return withCalendar(user, async ({ calendar }) => {
      await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: notifyAttendees ? 'all' : 'none' });
      return { deleted: true, eventId };
    });
  },
};
