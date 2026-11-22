// The agent loop: ask Claude → if it wants tools, run them → send results back → repeat until it gives a final answer.
// Every turn is saved to MongoDB as it happens, so the history is always valid even if the user stops halfway.
import { Message } from '../models/Message.js';
import { Integration } from '../models/Integration.js';
import { streamReply, extractText, isAbortError, isApiError } from './llmService.js';
import { executeToolUse } from './toolExecutor.js';
import { getApiTools } from '../tools/index.js';
import { buildSystemPrompt } from '../prompts/systemPrompt.js';

const MAX_ITERATIONS = 10; // safety limit on model turns per user message (SRS FR-4.3)
const MAX_TURN_RETRIES = 2; // retries when a streamed tool input can't be parsed
const REFUSAL_TEXT = "Sorry, I can't help with that request.";

/**
 * Runs the agent for one user message.
 * @param {object} opts
 * @param {object} opts.user - logged-in user document
 * @param {object} opts.conversation - conversation document
 * @param {Array} opts.history - API-format messages, ending with the new user message
 * @param {AbortSignal} opts.signal - set when the user presses Stop
 * @param {(event: string, data: object) => void} opts.emit - sends a live event to the browser
 * @returns {Promise<object[]>} the assistant messages saved during this run (for the UI)
 */
export async function runAgent({ user, conversation, history, signal, emit }) {
  const messages = [...history];
  const saved = [];
  const ctx = { user, conversationId: conversation._id };
  const google = await Integration.findOne({ userId: user._id, provider: 'google' });
  const system = buildSystemPrompt(user, { google });
  const tools = getApiTools();

  const save = async (fields) => {
    const doc = await Message.create({ conversationId: conversation._id, userId: user._id, ...fields });
    if (fields.role === 'assistant') saved.push(doc);
    return doc;
  };

  let retries = 0;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal.aborted) break;

    // ---- 1. Stream one model turn ----
    emit('turn_start', {});
    let partialText = '';
    let final;
    try {
      final = await streamReply({
        system,
        messages,
        tools,
        signal,
        onText: (text) => {
          partialText += text;
          emit('delta', { text });
        },
        onToolStart: ({ id, name }) => emit('tool_start', { id, name }),
        onServerToolResult: (id, ok) => emit('tool_result', { id, status: ok ? 'success' : 'failed' }),
      });
      retries = 0;
    } catch (err) {
      if (isAbortError(err)) {
        // User stopped: keep the text they already saw so history matches the screen
        if (partialText.trim()) await save({ role: 'assistant', content: [{ type: 'text', text: partialText }], text: partialText, status: 'stopped' });
        return saved;
      }
      // A streamed tool input that isn't valid JSON (not an API error): re-run this turn a couple of times
      if (!isApiError(err) && retries++ < MAX_TURN_RETRIES) {
        console.warn('Re-running turn after stream error:', err.message);
        emit('turn_reset', {});
        iteration--;
        continue;
      }
      throw err;
    }

    // ---- 2. Handle how the turn ended ----
    if (final.stop_reason === 'refusal') {
      // Every model in the fallback chain declined: drop this turn's partial output
      emit('turn_reset', {});
      await save({ role: 'assistant', content: REFUSAL_TEXT, text: REFUSAL_TEXT, status: 'refused', stopReason: 'refusal' });
      return saved;
    }

    const toolUses = final.content.filter((b) => b.type === 'tool_use');
    const assistantDoc = await save({
      role: 'assistant',
      content: final.content, // stored unchanged so it can be replayed to the API later
      text: extractText(final.content),
      model: final.model,
      stopReason: final.stop_reason,
      usage: {
        inputTokens: final.usage?.input_tokens,
        outputTokens: final.usage?.output_tokens,
        cacheReadTokens: final.usage?.cache_read_input_tokens,
      },
    });
    messages.push({ role: 'assistant', content: final.content });

    // Server tool (web search) hit its internal limit: send the turn back and the server continues
    if (final.stop_reason === 'pause_turn') continue;

    if (toolUses.length === 0) return saved; // final answer

    // ---- 3. Run the requested tools (in parallel) and send all results back in one message ----
    // A tool input cut off by max_tokens can still look valid, so never run tools from a truncated turn
    const results =
      final.stop_reason === 'max_tokens'
        ? toolUses.map((b) => ({
            status: 'failed',
            result: { type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'Tool input was cut off (output limit reached).' },
          }))
        : await Promise.all(toolUses.map((block) => executeToolUse(block, ctx)));

    for (const [i, { status, needsIntegration }] of results.entries()) {
      emit('tool_result', { id: toolUses[i].id, status, needsIntegration });
    }

    assistantDoc.toolRuns = toolUses.map((b, i) => ({
      toolUseId: b.id,
      name: b.name,
      status: results[i].status,
      needsIntegration: results[i].needsIntegration,
    }));
    await assistantDoc.save();
    await save({ role: 'user', kind: 'tool_results', content: results.map((r) => r.result) });
    messages.push({ role: 'user', content: results.map((r) => r.result) });
  }

  if (!signal.aborted) emit('error', { message: 'This task needed too many steps, so I stopped. Try breaking it into smaller requests.' });
  return saved;
}

export { REFUSAL_TEXT };
