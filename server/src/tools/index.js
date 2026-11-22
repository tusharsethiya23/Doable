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
];

// Write tools need user approval unless marked low-risk
export const needsApproval = (tool) => tool.type === 'write' && !tool.autoApprove;

// Hide tools whose integration isn't configured on this server (e.g. no Google credentials in .env)
const integrationEnabled = { google: googleEnabled };
const tools = allTools.filter((t) => !t.integration || integrationEnabled[t.integration]);

const toolsByName = new Map(tools.map((t) => [t.name, t]));

export const getTool = (name) => toolsByName.get(name);

// Converts a Zod schema to the JSON Schema format the Claude API expects
function toInputSchema(zodSchema) {
  const { $schema: _drop, ...schema } = z.toJSONSchema(zodSchema, { io: 'input' }); // 'input' = fields with defaults are optional
  return schema;
}

// Tool definitions sent to Claude. Built once, in a fixed order, so prompt caching keeps working.
const apiTools = [
  ...tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toInputSchema(t.inputSchema),
    eager_input_streaming: true, // stream tool inputs as they are generated (we validate them ourselves)
  })),
  // Server tool: runs on Anthropic's servers, no code needed on our side
  ...(env.ENABLE_WEB_SEARCH ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }] : []),
];

export const getApiTools = () => apiTools;
