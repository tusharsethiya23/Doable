// Zod pieces shared by the reminder / scheduled task tools.
import { z } from 'zod';
import { dateTime } from './calendarSchemas.js';

export const at = dateTime('When it should happen').optional();

export const repeat = z
  .string()
  .trim()
  .max(100)
  .optional()
  .describe(
    'Optional repeating schedule as a 5-field cron expression in the user\'s time zone: "minute hour day-of-month month day-of-week". Examples: "0 9 * * *" every day 09:00, "0 9 * * 1-5" weekdays 09:00, "30 18 * * 5" Fridays 18:30, "0 10 1 * *" 1st of each month 10:00.'
  );
