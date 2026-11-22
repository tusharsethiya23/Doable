// Tool registry: the single list of tools the agent can use.
// To add a tool: create a file in this folder and add it to `allTools` below. A tool exports:
//   name, description (say WHEN to call it), type ('read' | 'write'), inputSchema (Zod), run(input, ctx)
//   optional: integration ('google') + scopes, autoApprove (low-risk write), preview(input, ctx) for approval cards
import { z } from 'zod';
import { env, googleEnabled } from '../config/env.js';
import getCurrentTime from './getCurrentTime.js';
import searchEmails from './searchEmails.js';
import readEmail from './readEmail.js';
import createDraft from './createDraft.js';
import sendEmail from './sendEmail.js';
import listEvents from './listEvents.js';
import checkAvailability from './checkAvailability.js';
import createEvent from './createEvent.js';
import updateEvent from './updateEvent.js';
import deleteEvent from './deleteEvent.js';
import createReminder from './createReminder.js';
import scheduleTask from './scheduleTask.js';
import listScheduledTasks from './listScheduledTasks.js';
import cancelScheduledTask from './cancelScheduledTask.js';
import webSearch from './webSearch.js';

const allTools = [
  getCurrentTime,
  searchEmails,
  readEmail,
  createDraft,
  sendEmail,
  listEvents,
  checkAvailability,
  createEvent,
  updateEvent,
  deleteEvent,
  createReminder,
  scheduleTask,
  listScheduledTasks,
  cancelScheduledTask,
];

// Write tools need user approval unless marked low-risk
export const needsApproval = (tool) => tool.type === 'write' && !tool.autoApprove;

// Tools whose results contain text written by other people (could hide instructions = prompt injection)
const UNTRUSTED_OUTPUT_TOOLS = new Set(['search_emails', 'read_email', 'list_events', 'web_search', 'web_fetch']);
export const readsUntrustedContent = (name) => UNTRUSTED_OUTPUT_TOOLS.has(name);

// Hide tools whose integration isn't configured on this server (e.g. no Google credentials in .env),
// and web search when it's switched off
const integrationEnabled = { google: googleEnabled };
const tools = [...allTools, ...(env.ENABLE_WEB_SEARCH ? [webSearch] : [])].filter(
  (t) => !t.integration || integrationEnabled[t.integration]
);

const toolsByName = new Map(tools.map((t) => [t.name, t]));

export const getTool = (name) => toolsByName.get(name);

// Converts a Zod schema to standard JSON Schema (Gemini accepts it as `parametersJsonSchema`)
function toInputSchema(zodSchema) {
  const { $schema: _drop, ...schema } = z.toJSONSchema(zodSchema, { io: 'input' }); // 'input' = fields with defaults are optional
  return schema;
}

// Function declarations sent to the model. Built once, in a fixed order (helps implicit prompt caching).
const apiTools = tools.map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: toInputSchema(t.inputSchema),
}));

export const getApiTools = () => apiTools;
