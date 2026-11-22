// Translates between the app's provider-neutral message format and Gemini's format.
//
// App format (stored in MongoDB, used by the agent loop, approvals and UI):
//   user:      "text"  or  [{ type: 'tool_result', tool_use_id, content, is_error? }]
//   assistant: [{ type: 'text', text, signature? }, { type: 'tool_use', id, name, input, nativeId?, signature? }]
// Gemini format:
//   { role: 'user' | 'model', parts: [{ text }, { functionCall }, { functionResponse }, …] }
//
// Gemini 3+ attaches a "thoughtSignature" to some parts and REQUIRES it back unchanged on function-call parts,
// so we store it on the block (`signature`) and replay it.
import crypto from 'node:crypto';

// Gemini's documented placeholder for function calls that have no signature (e.g. history from another model)
export const SKIP_SIGNATURE = 'skip_thought_signature_validator';

const newToolId = () => `call_${crypto.randomBytes(8).toString('hex')}`;

// Tool results are strings in our format; Gemini wants an object
function toFunctionResponseBody(block) {
  let value = block.content;
  try {
    value = JSON.parse(block.content);
  } catch {
    // plain text result — keep the string
  }
  return block.is_error ? { error: value } : { output: value };
}

/** App messages → Gemini `contents`. Consecutive turns of the same role are merged (Gemini expects alternation). */
export function toGeminiContents(messages) {
  const toolNames = new Map(); // tool_use id → { name, nativeId } (function responses must name their function)
  const contents = [];
  const push = (role, parts) => {
    if (!parts.length) return;
    const last = contents.at(-1);
    if (last?.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };

  for (const m of messages) {
    if (typeof m.content === 'string') {
      push(m.role === 'assistant' ? 'model' : 'user', [{ text: m.content }]);
      continue;
    }

    if (m.role === 'assistant') {
      let sawFunctionCall = false;
      const parts = [];
      for (const b of m.content) {
        if (b.type === 'text' && b.text) {
          parts.push({ text: b.text, ...(b.signature && { thoughtSignature: b.signature }) });
        } else if (b.type === 'tool_use') {
          toolNames.set(b.id, { name: b.name, nativeId: b.nativeId });
          // The first function call of a turn must carry a signature; use Gemini's placeholder if we have none
          const signature = b.signature || (!sawFunctionCall ? SKIP_SIGNATURE : undefined);
          parts.push({
            functionCall: { name: b.name, args: b.input ?? {}, ...(b.nativeId && { id: b.id }) },
            ...(signature && { thoughtSignature: signature }),
          });
          sawFunctionCall = true;
        }
        // other block types (e.g. 'thinking' from older Claude history) are not sent
      }
      push('model', parts);
    } else {
      const parts = m.content
        .map((b) => {
          if (b.type === 'text') return { text: b.text };
          if (b.type !== 'tool_result') return null;
          const tool = toolNames.get(b.tool_use_id);
          return {
            functionResponse: {
              name: tool?.name ?? 'unknown_tool',
              ...(tool?.nativeId && { id: b.tool_use_id }),
              response: toFunctionResponseBody(b),
            },
          };
        })
        .filter(Boolean);
      push('user', parts);
    }
  }
  return contents;
}

/** Gives every function call an id (Gemini may omit it) — call while streaming so the UI gets the same id. */
export function ensureFunctionCallId(part) {
  if (!part.functionCall) return;
  if (part.functionCall.id) part.nativeId = true;
  else part.functionCall.id = newToolId();
}

/** Gemini response parts → app content blocks (thought parts are skipped, signatures kept). */
export function fromGeminiParts(parts) {
  const blocks = [];
  for (const p of parts) {
    if (p.thought) continue; // reasoning summaries (we don't request them)
    if (p.functionCall) {
      blocks.push({
        type: 'tool_use',
        id: p.functionCall.id,
        name: p.functionCall.name,
        input: p.functionCall.args ?? {},
        ...(p.nativeId && { nativeId: true }),
        ...(p.thoughtSignature && { signature: p.thoughtSignature }),
      });
    } else if (p.text) {
      const last = blocks.at(-1);
      if (last?.type === 'text') {
        last.text += p.text; // streamed text arrives in many small parts
        if (p.thoughtSignature) last.signature = p.thoughtSignature;
      } else {
        blocks.push({ type: 'text', text: p.text, ...(p.thoughtSignature && { signature: p.thoughtSignature }) });
      }
    } else if (p.thoughtSignature && blocks.length && !blocks.at(-1).signature) {
      blocks.at(-1).signature = p.thoughtSignature; // a signature can arrive in its own empty part
    }
  }
  return blocks;
}

const REFUSAL_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);
const MALFORMED_REASONS = new Set(['MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL']);

/**
 * Maps Gemini's finishReason to the app's stop reasons: end_turn | tool_use | max_tokens | refusal.
 * A malformed tool call throws (the agent loop re-runs the turn).
 */
export function toStopReason(finishReason, blocks) {
  if (MALFORMED_REASONS.has(finishReason)) throw new Error(`Gemini returned ${finishReason}`);
  if (REFUSAL_REASONS.has(finishReason)) return 'refusal';
  if (finishReason === 'MAX_TOKENS') return 'max_tokens';
  return blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
}

/** Gemini usage metadata → the app's usage fields (used for usage tracking and the admin dashboard). */
export function toUsage(meta = {}) {
  const cached = meta.cachedContentTokenCount || 0;
  return {
    input_tokens: Math.max(0, (meta.promptTokenCount || 0) - cached),
    output_tokens: (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0),
    cache_read_input_tokens: cached,
  };
}
