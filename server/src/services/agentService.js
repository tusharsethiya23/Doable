// The agent loop: ask Claude → if it wants tools, run them → send results back → repeat until it gives a final answer.
// Every turn is saved to MongoDB as it happens, so the history is always valid even if the user stops halfway.
// If a turn contains actions that need approval, the loop PAUSES (conversation.status = 'awaiting_approval')
// and resumes later via resumeAgent() once the user has approved/rejected them.
import { Message } from '../models/Message.js';
import { Integration } from '../models/Integration.js';
import { Conversation } from '../models/Conversation.js';
import { Action } from '../models/Action.js';
import { streamReply, extractText, isAbortError, isApiError } from './llmService.js';
import { prepareToolUse, resolveApproval, toolResult } from './toolExecutor.js';
import { buildApiHistory } from './chatService.js';
import { getApiTools } from '../tools/index.js';
import { buildSystemPrompt } from '../prompts/systemPrompt.js';
import { ApiError } from '../utils/ApiError.js';

const MAX_ITERATIONS = 10; // safety limit on model turns per user message (SRS FR-4.3)
const MAX_TURN_RETRIES = 2; // retries when a streamed tool input can't be parsed
const REFUSAL_TEXT = "Sorry, I can't help with that request.";

const toolUsesOf = (content) => (Array.isArray(content) ? content.filter((b) => b.type === 'tool_use') : []);

// Saves the hidden "tool results" turn and records each tool's final status on the assistant message
async function saveToolResults({ conversation, user, assistantDoc, toolUses, outcomes }) {
  assistantDoc.toolRuns = toolUses.map((b, i) => ({
    toolUseId: b.id,
    name: b.name,
    status: outcomes[i].kind === 'approval' ? 'pending' : outcomes[i].status,
    needsIntegration: outcomes[i].needsIntegration,
  }));
  await assistantDoc.save();
  await Message.create({
    conversationId: conversation._id,
    userId: user._id,
    role: 'user',
    kind: 'tool_results',
    content: outcomes.map((o) => o.result),
  });
}

/**
 * Runs the agent until it gives a final answer, pauses for approval, or hits the step limit.
 * @param {object} opts
 * @param {object} opts.user - logged-in user document
 * @param {object} opts.conversation - conversation document
 * @param {Array} opts.history - API-format messages (ends with a user message or tool results)
 * @param {AbortSignal} opts.signal - set when the user presses Stop
 * @param {(event: string, data: object) => void} opts.emit - sends a live event to the browser
 * @param {(tool, input) => boolean|Promise<boolean>} [opts.autoApprove] - lets pre-approved write actions skip the card
 * @returns {Promise<{ messages: object[], awaitingApproval: boolean }>} assistant messages saved during this run
 */
export async function runAgent({ user, conversation, history, signal, emit, autoApprove }) {
  const messages = [...history];
  const saved = [];
  const google = await Integration.findOne({ userId: user._id, provider: 'google' });
  const system = buildSystemPrompt(user, { google });
  const tools = getApiTools();

  const saveAssistant = async (fields) => {
    const doc = await Message.create({ conversationId: conversation._id, userId: user._id, role: 'assistant', ...fields });
    saved.push(doc);
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
        if (partialText.trim()) await saveAssistant({ content: [{ type: 'text', text: partialText }], text: partialText, status: 'stopped' });
        return { messages: saved, awaitingApproval: false };
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
      await saveAssistant({ content: REFUSAL_TEXT, text: REFUSAL_TEXT, status: 'refused', stopReason: 'refusal' });
      return { messages: saved, awaitingApproval: false };
    }

    const toolUses = toolUsesOf(final.content);
    const assistantDoc = await saveAssistant({
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

    if (toolUses.length === 0) return { messages: saved, awaitingApproval: false }; // final answer

    // ---- 3. Run tools now, or create approval requests for write actions ----
    const ctx = { user, conversationId: conversation._id, messageId: assistantDoc._id, autoApprove };
    // A tool input cut off by max_tokens can still look valid, so never run tools from a truncated turn
    const outcomes =
      final.stop_reason === 'max_tokens'
        ? toolUses.map((b) => ({ kind: 'done', status: 'failed', result: toolResult(b.id, 'Tool input was cut off (output limit reached).', true) }))
        : await Promise.all(toolUses.map((block) => prepareToolUse(block, ctx)));

    outcomes.forEach((o, i) => {
      emit('tool_result', { id: toolUses[i].id, status: o.kind === 'approval' ? 'pending' : o.status, needsIntegration: o.needsIntegration });
    });

    const approvals = outcomes.filter((o) => o.kind === 'approval');
    if (approvals.length) {
      // ---- 4. Pause: remember results of tools that already ran, and wait for the user ----
      assistantDoc.toolRuns = toolUses.map((b, i) => ({
        toolUseId: b.id,
        name: b.name,
        status: outcomes[i].kind === 'approval' ? 'pending' : outcomes[i].status,
        needsIntegration: outcomes[i].needsIntegration,
      }));
      await assistantDoc.save();
      conversation.status = 'awaiting_approval';
      conversation.pendingTurn = {
        assistantMessageId: assistantDoc._id,
        results: Object.fromEntries(outcomes.filter((o) => o.kind === 'done').map((o) => [o.result.tool_use_id, o.result])),
      };
      await conversation.save();
      emit('approval_required', { actions: approvals.map((a) => a.action) });
      return { messages: saved, awaitingApproval: true };
    }

    await saveToolResults({ conversation, user, assistantDoc, toolUses, outcomes });
    messages.push({ role: 'user', content: outcomes.map((o) => o.result) });
  }

  if (!signal.aborted) emit('error', { message: 'This task needed too many steps, so I stopped. Try breaking it into smaller requests.' });
  return { messages: saved, awaitingApproval: false };
}

/**
 * Completes a paused turn: runs approved actions, marks rejected/undecided ones, and saves all tool results
 * so the history is valid again. Called when resuming, or when the user sends a new message instead.
 * Uses an atomic status change so two requests can't finalize the same turn twice.
 * @returns {Promise<boolean>} false if there was no paused turn to finalize
 */
export async function finalizePausedTurn({ user, conversation, emit }) {
  const claimed = await Conversation.findOneAndUpdate(
    { _id: conversation._id, status: 'awaiting_approval' },
    { status: 'resuming' },
    { returnDocument: 'after' }
  );
  if (!claimed) return false;

  try {
    const assistantDoc = await Message.findById(claimed.pendingTurn.assistantMessageId);
    const toolUses = toolUsesOf(assistantDoc.content);
    const earlier = claimed.pendingTurn.results || {};
    const ctx = { user, conversationId: claimed._id, messageId: assistantDoc._id };

    const outcomes = [];
    for (const block of toolUses) {
      // Tools that ran before the pause already have results; approvals are resolved one at a time, in order
      const outcome = earlier[block.id] ? { kind: 'done', status: 'success', result: earlier[block.id] } : await resolveApproval(block, ctx);
      if (!earlier[block.id]) emit('tool_result', { id: block.id, status: outcome.status, needsIntegration: outcome.needsIntegration });
      outcomes.push(outcome);
    }

    // Keep statuses of tools that ran before the pause as they were
    const previous = new Map((assistantDoc.toolRuns || []).map((r) => [r.toolUseId, r]));
    outcomes.forEach((o, i) => {
      const prev = previous.get(toolUses[i].id);
      if (prev && prev.status !== 'pending') {
        o.status = prev.status;
        o.needsIntegration = prev.needsIntegration;
      }
    });
    await saveToolResults({ conversation: claimed, user, assistantDoc, toolUses, outcomes });
  } finally {
    await Conversation.updateOne({ _id: claimed._id }, { status: 'idle', $unset: { pendingTurn: 1 } });
    conversation.status = 'idle';
    conversation.pendingTurn = undefined;
  }
  return true;
}

/** Resumes the agent after the user decided on every pending approval. */
export async function resumeAgent({ user, conversation, signal, emit }) {
  if (conversation.status !== 'awaiting_approval') throw new ApiError(409, 'Nothing is waiting for approval in this conversation');
  const undecided = await Action.countDocuments({
    messageId: conversation.pendingTurn?.assistantMessageId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });
  if (undecided) throw new ApiError(409, `Still waiting for your decision on ${undecided} action(s)`);

  const finalized = await finalizePausedTurn({ user, conversation, emit });
  if (!finalized) throw new ApiError(409, 'Nothing is waiting for approval in this conversation');
  const history = await buildApiHistory(conversation._id);
  return runAgent({ user, conversation, history, signal, emit });
}

export { REFUSAL_TEXT };
