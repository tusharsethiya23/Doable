// Runs one tool call requested by Claude: validates the input, executes the tool, logs it, and builds the tool_result.
import { getTool } from '../tools/index.js';
import { Action } from '../models/Action.js';

const toText = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * @param {object} block - the `tool_use` block from Claude ({ id, name, input })
 * @param {object} ctx - { user, conversationId }
 * @returns {Promise<{ result: object, status: 'success'|'failed' }>} result is the tool_result block for the API
 */
export async function executeToolUse(block, ctx) {
  const started = Date.now();
  const tool = getTool(block.name);

  const finish = async ({ status, output, error }) => {
    await Action.create({
      userId: ctx.user._id,
      conversationId: ctx.conversationId,
      toolUseId: block.id,
      toolName: block.name,
      type: tool?.type ?? 'read',
      input: block.input,
      output,
      error,
      status,
      durationMs: Date.now() - started,
    });
    return {
      status,
      result: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: status === 'success' ? output : error,
        ...(status !== 'success' && { is_error: true }), // tells Claude the call failed so it can recover
      },
    };
  };

  if (!tool) return finish({ status: 'failed', error: `Unknown tool: ${block.name}` });

  // Tool inputs stream eagerly, so the API doesn't validate them — we must, before running anything
  const parsed = tool.inputSchema.safeParse(block.input);
  if (!parsed.success) {
    return finish({
      status: 'failed',
      error: JSON.stringify({
        INVALID_JSON: JSON.stringify(block.input),
        issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`),
      }),
    });
  }

  // Safety net: tools with side effects must be confirmed by the user first (confirmation flow arrives in Phase 5)
  if (tool.type === 'write') {
    return finish({ status: 'failed', error: 'This action needs user confirmation, which is not available yet.' });
  }

  try {
    const output = toText(await tool.run(parsed.data, ctx));
    return finish({ status: 'success', output });
  } catch (err) {
    console.error(`Tool ${block.name} failed:`, err);
    return finish({ status: 'failed', error: `Tool failed: ${err.message}` });
  }
}
