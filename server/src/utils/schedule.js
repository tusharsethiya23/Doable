// Helpers for repeating schedules written as cron expressions ("minute hour day-of-month month day-of-week"),
// always evaluated in the user's time zone. Example: "0 9 * * 1-5" = weekdays at 09:00.
import { CronExpressionParser } from 'cron-parser';

// Next run time strictly after `after`
export function nextCronRun(cron, timeZone, after = new Date()) {
  return CronExpressionParser.parse(cron, { tz: timeZone, currentDate: after }).next().toDate();
}

// The next `count` run times (for previews like "Next runs: Mon 9:00, Tue 9:00…")
export function nextCronRuns(cron, timeZone, count = 3, after = new Date()) {
  const it = CronExpressionParser.parse(cron, { tz: timeZone, currentDate: after });
  return Array.from({ length: count }, () => it.next().toDate());
}

/**
 * Checks a cron expression: valid 5-field syntax and not more frequent than `minMinutes`
 * (protects against a task running every minute and burning AI credits).
 * @returns {string|null} an error message, or null if OK
 */
export function cronProblem(cron, timeZone, minMinutes) {
  if (cron.trim().split(/\s+/).length !== 5) return 'Use 5 fields: minute hour day-of-month month day-of-week (e.g. "0 9 * * 1-5")';
  let runs;
  try {
    runs = nextCronRuns(cron, timeZone, 4);
  } catch (err) {
    return `Invalid schedule: ${err.message}`;
  }
  const smallestGap = Math.min(...runs.slice(1).map((r, i) => r - runs[i]));
  if (smallestGap < minMinutes * 60000) return `Too frequent: it must not repeat more often than every ${minMinutes} minutes`;
  return null;
}
