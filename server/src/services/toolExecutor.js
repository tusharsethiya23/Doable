// Runs tool calls requested by Claude. Each call either:
//   - runs now (read tools, low-risk writes) → { kind: 'done', status, result }
//   - waits for the user's approval (write tools) → { kind: 'approval', action }   (an Action with status "pending")
// Every call is recorded in the Action log.
import { getTool, needsApproval } from '../tools/index.js';
import { Action, APPROVAL_TTL_MS } from '../models/Action.js';
import { IntegrationError } from '../utils/ApiError.js';
import { getGoogleAuth } from './googleAuthService.js';
import { logError } from '../utils/logger.js';

const MAX_TOOL_OUTPUT_CHARS = 40000; // a huge tool result would flood the AI's context and cost a lot

const toText = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TOOL_OUTPUT_CHARS ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n…[output truncated]` : text;
};

const UNTRUSTED_WARNING =
  'Suggested right after reading emails, events or web pages. Make sure this is what YOU asked for — text from others can try to trick the assistant.';

// Builds the tool_result block sent back to Claude
export const toolResult = (toolUseId, content, isError = false) => ({
  type: 'tool_result',
  tool_use_id: toolUseId,
  content,
  ...(isError && { is_error: true }), // tells Claude the call failed so it can recover
});

/** Saves the outcome to the Action log (updating `action` if it already exists) and returns a "done" result. */
async function finish(block, ctx, { tool, status, output, error, needsIntegration, action, startedAt, input }) {
  const fields = { status, output, error, durationMs: Date.now() - startedAt };
  if (action) {
    Object.assign(action, fields);
    await action.save();
  } else {
    await Action.create({
      ...fields,
      userId: ctx.user._id,
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      toolUseId: block.id,
      toolName: block.name,
      type: tool?.type ?? 'read',
      input: input ?? block.input,
    });
  }
  return {
    kind: 'done',
    status,
    needsIntegration,
    result: toolResult(block.id, status === 'success' ? output : error, status !== 'success'),
  };
}

/** Actually runs a tool (after validation / approval) and records the result. */
export async function runTool(tool, block, input, ctx, action) {
  const startedAt = Date.now();
  try {
    const output = toText(await tool.run(input, ctx));
    return finish(block, ctx, { tool, status: 'success', output, action, startedAt, input });
  } catch (err) {
    if (err instanceof IntegrationError) {
      return finish(block, ctx, { tool, status: 'failed', error: err.message, needsIntegration: err.provider, action, startedAt, input });
    }
    logError(`Tool ${block.name} failed`, err);
    return finish(block, ctx, { tool, status: 'failed', error: `Tool failed: ${err.message}`, action, startedAt, input });
  }
}

/**
 * First step for every tool call in a turn: validate, then run it now or create a pending approval.
 * @param {object} block - `tool_use` block ({ id, name, input })
 * @param {object} ctx - { user, conversationId, messageId, autoApprove? }
 *   autoApprove(tool, input) → true lets a write action skip the card (used by scheduled tasks the user pre-approved)
 */
export async function prepareToolUse(block, ctx) {
  const startedAt = Date.now();
  const tool = getTool(block.name);
  if (!tool) return finish(block, ctx, { status: 'failed', error: `Unknown tool: ${block.name}`, startedAt });

  // Tool inputs stream eagerly, so the API doesn't validate them — we must, before running anything
  const parsed = tool.inputSchema.safeParse(block.input);
  if (!parsed.success) {
    const error = JSON.stringify({
      INVALID_JSON: JSON.stringify(block.input),
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`),
    });
    return finish(block, ctx, { tool, status: 'failed', error, startedAt });
  }

  if (!needsApproval(tool) || (await ctx.autoApprove?.(tool, parsed.data))) return runTool(tool, block, parsed.data, ctx);

  // Needs approval: first make sure it could actually run (account connected), then build the card preview
  try {
    if (tool.integration === 'google') await getGoogleAuth(ctx.user, tool.scopes);
    const preview = tool.preview ? await tool.preview(parsed.data, ctx) : { title: block.name, fields: [] };
    if (ctx.afterUntrusted) preview.warning = UNTRUSTED_WARNING; // prompt-injection hint on the card
    const action = await Action.create({
      userId: ctx.user._id,
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      toolUseId: block.id,
      toolName: block.name,
      type: 'write',
      input: parsed.data,
      preview,
      status: 'pending',
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    });
    return { kind: 'approval', action };
  } catch (err) {
    if (err instanceof IntegrationError) {
      return finish(block, ctx, { tool, status: 'failed', error: err.message, needsIntegration: err.provider, startedAt });
    }
    // e.g. update/delete of an event id that doesn't exist
    return finish(block, ctx, { tool, status: 'failed', error: `Could not prepare this action: ${err.message}`, startedAt });
  }
}

/**
 * Turns a decided approval into a tool_result: runs it if approved (once — guarded by an atomic status change),
 * otherwise tells Claude it was rejected or expired.
 */
export async function resolveApproval(block, ctx) {
  const action = await Action.findOne({ userId: ctx.user._id, toolUseId: block.id, messageId: ctx.messageId });
  if (!action) return { kind: 'done', status: 'failed', result: toolResult(block.id, 'Interrupted before the tool ran.', true) };

  if (action.status === 'approved') {
    // Claim it so a double-click / two tabs can never run it twice (SRS NFR-15)
    const claimed = await Action.findOneAndUpdate({ _id: action._id, status: 'approved' }, { status: 'running' }, { returnDocument: 'after' });
    if (!claimed) return { kind: 'done', status: 'failed', result: toolResult(block.id, 'This action was already processed.', true) };

    const input = claimed.editedInput ?? claimed.input;
    const outcome = await runTool(getTool(block.name), block, input, ctx, claimed);
    // Let Claude know if the user changed the details before approving
    if (claimed.editedInput && outcome.status === 'success') {
      outcome.result.content = `The user edited the details before approving. Final values used: ${JSON.stringify(input)}\nResult: ${outcome.result.content}`;
    }
    return outcome;
  }

  if (action.status === 'rejected') {
    return {
      kind: 'done',
      status: 'rejected',
      result: toolResult(block.id, "The user rejected this action, so it was NOT done. Don't retry it unless the user asks.", true),
    };
  }

  // Already finished earlier (e.g. a retried resume): reuse the stored outcome instead of running again
  if (action.status === 'success' || action.status === 'failed') {
    return { kind: 'done', status: action.status, result: toolResult(block.id, action.output ?? action.error ?? '', action.status === 'failed') };
  }
  if (action.status === 'running') {
    return { kind: 'done', status: 'failed', result: toolResult(block.id, 'This action was interrupted while running; its outcome is unknown.', true) };
  }

  // Still pending (timed out, or the user moved on without deciding) → expire it
  if (action.status === 'pending') await Action.updateOne({ _id: action._id, status: 'pending' }, { status: 'expired', decidedAt: new Date() });
  return {
    kind: 'done',
    status: 'expired',
    result: toolResult(block.id, "The user didn't approve this action, so it was NOT done. Ask if they still want it.", true),
  };
}
