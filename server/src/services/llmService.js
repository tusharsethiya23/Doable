// Talks to Claude: streams a reply token by token and returns the final message.
// Also contains helpers to prepare stored history for the API and to turn SDK errors into friendly messages.
import { getLLMClient, Anthropic } from '../config/llm.js';
import { env } from '../config/env.js';

// Beta header that enables server-side fallback: if the model declines a request for safety reasons,
// the API automatically retries it on Anthropic's recommended fallback model.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Streams a reply from Claude.
 * @param {object} opts
 * @param {string} opts.system - system prompt
 * @param {Array} opts.messages - conversation history in API format
 * @param {AbortSignal} [opts.signal] - abort when the user presses Stop / closes the tab
 * @param {(text: string) => void} opts.onText - called with every new piece of text
 * @returns {Promise<object>} the final API message (content, stop_reason, usage, model)
 */
export async function streamReply({ system, messages, signal, onText }) {
  const stream = getLLMClient().beta.messages.stream(
    {
      model: env.LLM_MODEL,
      max_tokens: env.LLM_MAX_TOKENS,
      output_config: { effort: env.LLM_EFFORT },
      system,
      messages,
      cache_control: { type: 'ephemeral' }, // cache the conversation prefix so follow-up turns are cheaper
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal }
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onText(event.delta.text);
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
