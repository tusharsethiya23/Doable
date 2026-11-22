// Tool registry: the single list of tools the agent can use.
// To add a tool: create a file in this folder (name, description, type, inputSchema, run) and add it to `tools` below.
import { z } from 'zod';
import { env } from '../config/env.js';
import getCurrentTime from './getCurrentTime.js';

const tools = [getCurrentTime];

const toolsByName = new Map(tools.map((t) => [t.name, t]));

export const getTool = (name) => toolsByName.get(name);

// Converts a Zod schema to the JSON Schema format the Claude API expects
function toInputSchema(zodSchema) {
  const { $schema: _drop, ...schema } = z.toJSONSchema(zodSchema);
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
