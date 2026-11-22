// Talks to the AI model (Google Gemini): streams one turn and returns it in the app's neutral format
// ({ content, stop_reason, usage, model }), so the agent loop doesn't depend on the provider.
// Also: plain-text extraction, error classification and friendly error messages.
import { getLLMClient, GeminiApiError } from '../config/llm.js';
import { env } from '../config/env.js';
import { toGeminiContents, fromGeminiParts, ensureFunctionCallId, toStopReason, toUsage } from './geminiFormat.js';

/**
 * Streams one turn from Gemini.
 * @param {object} opts
 * @param {string} opts.system - system prompt
 * @param {Array} opts.messages - conversation history in the app's format
 * @param {Array} [opts.tools] - function declarations ({ name, description, parametersJsonSchema })
 * @param {AbortSignal} [opts.signal] - abort when the user presses Stop / closes the tab
 * @param {(text: string) => void} opts.onText - called with every new piece of text
 * @param {(call: {id: string, name: string}) => void} [opts.onToolStart] - called when the model requests a tool
 * @returns {Promise<{ content: object[], stop_reason: string, usage: object, model: string }>}
 */
export async function streamReply({ system, messages, tools, signal, onText, onToolStart }) {
  const parts = [];
  let finishReason;
  let usageMeta;
  let modelVersion;

  try {
    const stream = await getLLMClient().models.generateContentStream({
      model: env.LLM_MODEL,
      contents: toGeminiContents(messages),
      config: {
        systemInstruction: system,
        maxOutputTokens: env.LLM_MAX_TOKENS,
        abortSignal: signal,
        ...(tools?.length && { tools: [{ functionDeclarations: tools }] }),
      },
    });

    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts || []) {
        if (part.thought) continue;
        if (part.text) onText(part.text);
        if (part.functionCall) {
          ensureFunctionCallId(part);
          onToolStart?.({ id: part.functionCall.id, name: part.functionCall.name });
        }
        parts.push(part);
      }
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (chunk.promptFeedback?.blockReason) finishReason = 'PROHIBITED_CONTENT'; // the prompt itself was blocked
      if (chunk.usageMetadata) usageMeta = chunk.usageMetadata;
      modelVersion ??= chunk.modelVersion;
    }
  } catch (err) {
    // Normalise "user pressed Stop" so the agent loop recognises it
    if (signal?.aborted) {
      const abort = new Error('Request aborted');
      abort.name = 'AbortError';
      throw abort;
    }
    throw err;
  }

  const content = fromGeminiParts(parts);
  return { content, stop_reason: toStopReason(finishReason, content), usage: toUsage(usageMeta), model: modelVersion ?? env.LLM_MODEL };
}

// Joins all text blocks of a turn into the plain text we show in the UI
export function extractText(content) {
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export const isAbortError = (err) => err?.name === 'AbortError';
// Errors returned by the Gemini API (HTTP status) — not retried by re-running the turn
export const isApiError = (err) => err instanceof GeminiApiError || typeof err?.status === 'number' || err?.code === 'NO_API_KEY';

// Turns AI errors into messages that are safe to show to the user
export function friendlyLLMError(err) {
  const status = err?.status;
  if (err?.code === 'NO_API_KEY' || status === 401 || status === 403 || /api key/i.test(err?.message || '')) {
    return 'The AI service is not configured correctly. Please check the server API key.';
  }
  if (status === 429) {
    return "The free AI quota is used up for now (Gemini's free tier limits requests per minute and per day). Please try again in a little while.";
  }
  if (status === 404) return 'The configured AI model was not found. Ask the admin to check LLM_MODEL.';
  if (status >= 500) return 'The AI service had a problem. Please try again.';
  if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT/i.test(err?.message || '')) return 'Could not reach the AI service. Please try again.';
  return 'Something went wrong while generating a reply.';
}
