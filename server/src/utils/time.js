// Time-zone helpers (no extra library): convert "2026-11-23T15:00" in the user's time zone to UTC, and format dates nicely.

// Accepts "2026-11-23", "2026-11-23T15:00", "2026-11-23T15:00:00", optionally with "Z" or "+05:30"
export const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
export const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const hasOffset = (value) => /(Z|[+-]\d{2}:\d{2})$/.test(value);

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Offset of a time zone at a given instant, in minutes (e.g. Asia/Kolkata → +330)
function tzOffsetMinutes(date, timeZone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName').value; // "GMT+05:30" or just "GMT"
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** Converts a local date-time in `timeZone` (or an ISO string with offset) to a JS Date. */
export function zonedToDate(value, timeZone) {
  if (hasOffset(value)) return new Date(value);
  const [datePart, timePart = '00:00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss = 0] = timePart.split(':').map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm, Math.floor(ss));
  // Guess with the offset at that moment, then correct once (handles daylight-saving changes)
  let utc = asIfUtc - tzOffsetMinutes(new Date(asIfUtc), timeZone) * 60000;
  utc = asIfUtc - tzOffsetMinutes(new Date(utc), timeZone) * 60000;
  return new Date(utc);
}

// "Mon, Nov 23, 3:00 PM" in the user's time zone
export function formatInZone(date, timeZone, { dateOnly = false } = {}) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(dateOnly ? {} : { hour: 'numeric', minute: '2-digit' }),
  }).format(date);
}

// "2026-11-23" for a Date in a given time zone
export function localDateString(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
