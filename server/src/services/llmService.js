// Talks to Claude: streams one model turn and returns the final message.
// Also contains helpers to prepare stored history for the API and to turn SDK errors into friendly messages.
import { getLLMClient, Anthropic } from '../config/llm.js';
import { env } from '../config/env.js';

// Beta header that enables server-side fallback: if the model declines a request for safety reasons,
// the API automatically retries it on Anthropic's recommended fallback model.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Streams one turn from Claude.
 * @param {object} opts
 * @param {string} opts.system - system prompt
 * @param {Array} opts.messages - conversation history in API format
 * @param {Array} [opts.tools] - tool definitions Claude may call
 * @param {AbortSignal} [opts.signal] - abort when the user presses Stop / closes the tab
 * @param {(text: string) => void} opts.onText - called with every new piece of text
 * @param {(block: {id: string, name: string}) => void} [opts.onToolStart] - called when Claude starts a tool call
 * @param {(toolUseId: string, ok: boolean) => void} [opts.onServerToolResult] - result of a server tool (web search)
 * @returns {Promise<object>} the final API message (content, stop_reason, usage, model)
 */
export async function streamReply({ system, messages, tools, signal, onText, onToolStart, onServerToolResult }) {
  const stream = getLLMClient().beta.messages.stream(
    {
      model: env.LLM_MODEL,
      max_tokens: env.LLM_MAX_TOKENS,
      output_config: { effort: env.LLM_EFFORT },
      system,
      messages,
      ...(tools?.length && { tools }),
      cache_control: { type: 'ephemeral' }, // cache the conversation prefix so follow-up turns are cheaper
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal }
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onText(event.delta.text);
    } else if (event.type === 'content_block_start') {
      const block = event.content_block;
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        onToolStart?.({ id: block.id, name: block.name });
      } else if (block.type === 'web_search_tool_result') {
        // On error, content is an object ({ error_code }); on success it is a list of results
        onServerToolResult?.(block.tool_use_id, Array.isArray(block.content));
      }
    }
  }

  return stream.finalMessage();
}

// Joins all text blocks of an API response into the plain text we show in the UI
export function extractText(content) {
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

// Prepares a stored assistant message for re-sending to the API.
// Blocks are sent back unchanged, except: after a mid-reply fallback, thinking/tool blocks that appear
// before the last `fallback` marker must be left out (the marker itself stays where it was).
export function toApiContent(content) {
  if (!Array.isArray(content)) return content;

  const lastFallback = content.findLastIndex((block) => block.type === 'fallback');
  if (lastFallback === -1) return content;

  const omitBeforeBoundary = new Set(['thinking', 'redacted_thinking', 'tool_use']);
  return content.filter((block, i) => i >= lastFallback || !omitBeforeBoundary.has(block.type));
}

export const isAbortError = (err) => err instanceof Anthropic.APIUserAbortError || err?.name === 'AbortError';
export const isApiError = (err) => err instanceof Anthropic.APIError;

// Turns SDK errors into messages that are safe to show to the user
export function friendlyLLMError(err) {
  if (err instanceof Anthropic.AuthenticationError || /api[_ ]?key/i.test(err?.message || '')) {
    return 'The AI service is not configured correctly. Please check the server API key.';
  }
  if (err instanceof Anthropic.RateLimitError) return 'The AI is busy right now. Please try again in a moment.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service. Please try again.';
  if (err instanceof Anthropic.InternalServerError) return 'The AI service had a problem. Please try again.';
  return 'Something went wrong while generating a reply.';
}
