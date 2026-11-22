// Google Calendar helpers used by the calendar tools: authenticated client, event formatting,
// converting the model's local times to API format, and finding free time slots.
import crypto from 'node:crypto';
import { calendar as calendarApi } from '@googleapis/calendar';
import { withGoogle } from './googleApi.js';
import { GOOGLE_SCOPES } from '../config/google.js';
import { zonedToDate, formatInZone, isDateOnly, localDateString } from '../utils/time.js';

export const CALENDAR_SCOPES = [GOOGLE_SCOPES.calendarEvents];

/** Runs fn({ calendar, integration }) with an authenticated Calendar client. */
export function withCalendar(user, fn) {
  return withGoogle(user, CALENDAR_SCOPES, ({ client, integration }) =>
    fn({ calendar: calendarApi({ version: 'v3', auth: client }), integration })
  );
}

// Model gives "2026-11-23T15:00" (user's local time) or "2026-11-23" (all-day) → Calendar API time object
export function toEventTime(value, timeZone) {
  if (isDateOnly(value)) return { date: value };
  return { dateTime: zonedToDate(value, timeZone).toISOString(), timeZone };
}

// Human-readable "Mon, Nov 23, 2026, 3:00 PM – 3:30 PM" for an API event
export function describeWhen(event, timeZone) {
  if (event.start?.date) {
    return `${formatInZone(zonedToDate(event.start.date, timeZone), timeZone, { dateOnly: true })} (all day)`;
  }
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  const endText = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(end);
  return `${formatInZone(start, timeZone)} – ${endText}`;
}

// Compact event summary for the AI and approval cards
export function summarizeEvent(event, timeZone) {
  return {
    id: event.id,
    title: event.summary || '(no title)',
    when: describeWhen(event, timeZone),
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location || undefined,
    attendees: (event.attendees || []).map((a) => a.email),
    meetLink: event.hangoutLink || undefined,
    link: event.htmlLink,
    // Descriptions can be written by other people, so they are labelled as untrusted
    untrusted_description: event.description ? event.description.slice(0, 1000) : undefined,
  };
}

// Builds the Calendar API request body from tool input (create or update)
export function buildEventBody(input, timeZone) {
  return {
    ...(input.title !== undefined && { summary: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.location !== undefined && { location: input.location }),
    ...(input.start && { start: toEventTime(input.start, timeZone) }),
    ...(input.end && { end: toEventTime(input.end, timeZone) }),
    ...(input.attendees && { attendees: input.attendees.map((email) => ({ email })) }),
    ...(input.addMeetLink && {
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    }),
  };
}

/**
 * Finds free slots between rangeStart and rangeEnd that are at least `durationMinutes` long,
 * given busy intervals ([{start, end}] as Dates). Optionally only within working hours in the user's time zone.
 */
export function findFreeSlots({ busy, rangeStart, rangeEnd, durationMinutes, timeZone, workingHours }) {
  // 1. Merge overlapping busy blocks
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const b of sorted) {
    const last = merged.at(-1);
    if (last && b.start <= last.end) last.end = new Date(Math.max(last.end, b.end));
    else merged.push({ start: new Date(b.start), end: new Date(b.end) });
  }

  // 2. Windows we may book in: the whole range, or each day's working hours inside it
  const windows = [];
  if (!workingHours) {
    windows.push({ start: rangeStart, end: rangeEnd });
  } else {
    let day = localDateString(rangeStart, timeZone);
    const lastDay = localDateString(rangeEnd, timeZone);
    while (day <= lastDay) {
      const start = zonedToDate(`${day}T${workingHours.start}`, timeZone);
      const end = zonedToDate(`${day}T${workingHours.end}`, timeZone);
      windows.push({ start: new Date(Math.max(start, rangeStart)), end: new Date(Math.min(end, rangeEnd)) });
      day = localDateString(new Date(zonedToDate(day, timeZone).getTime() + 36 * 3600 * 1000), timeZone); // next day
    }
  }

  // 3. Subtract busy blocks from each window and keep gaps long enough
  const minMs = durationMinutes * 60000;
  const slots = [];
  for (const w of windows) {
    let cursor = w.start;
    for (const b of merged) {
      if (b.end <= cursor || b.start >= w.end) continue;
      if (b.start - cursor >= minMs) slots.push({ start: cursor, end: b.start });
      cursor = new Date(Math.max(cursor, b.end));
    }
    if (w.end - cursor >= minMs) slots.push({ start: cursor, end: w.end });
  }
  return slots;
}
