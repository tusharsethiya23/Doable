// Unit tests for the Gemini translation layer: history → Gemini contents, Gemini parts → app blocks,
// thought signatures, stop reasons and usage.
import { describe, it, expect } from 'vitest';
import { toGeminiContents, fromGeminiParts, ensureFunctionCallId, toStopReason, toUsage, SKIP_SIGNATURE } from '../../src/services/geminiFormat.js';

describe('toGeminiContents', () => {
  it('converts a tool round-trip, keeping signatures and naming the function response', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'What time is it?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking.' },
          { type: 'tool_use', id: 'call_1', name: 'get_current_time', input: {}, signature: 'SIG' },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"local":"10:00"}' }] },
    ]);

    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'What time is it?' }] },
      { role: 'model', parts: [{ text: 'Checking.' }, { functionCall: { name: 'get_current_time', args: {} }, thoughtSignature: 'SIG' }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_current_time', response: { output: { local: '10:00' } } } }] },
    ]);
  });

  it('sends native ids back, marks errors, and uses the placeholder signature when none was stored', () => {
    const [, model, user] = toGeminiContents([
      { role: 'user', content: 'x' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'g-1', nativeId: true, name: 'a', input: { q: 1 } },
          { type: 'tool_use', id: 'g-2', nativeId: true, name: 'b', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'g-1', content: 'boom', is_error: true },
          { type: 'tool_result', tool_use_id: 'g-2', content: 'ok' },
        ],
      },
    ]);
    expect(model.parts[0]).toEqual({ functionCall: { name: 'a', args: { q: 1 }, id: 'g-1' }, thoughtSignature: SKIP_SIGNATURE });
    expect(model.parts[1].thoughtSignature).toBeUndefined(); // only the first call of a turn needs one
    expect(user.parts[0].functionResponse).toEqual({ name: 'a', id: 'g-1', response: { error: 'boom' } });
  });

  it('merges consecutive turns of the same role and skips unknown blocks', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'hi' }] },
    ]);
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'first' }, { text: 'second' }] },
      { role: 'model', parts: [{ text: 'hi' }] },
    ]);
  });
});

describe('fromGeminiParts', () => {
  it('joins streamed text, skips thoughts, keeps function calls with ids and signatures', () => {
    const parts = [
      { text: 'Hel' },
      { text: 'lo', thought: true },
      { text: 'lo!' },
      { functionCall: { name: 'get_current_time', args: {} }, thoughtSignature: 'SIG' },
      { functionCall: { id: 'native-9', name: 'list_events', args: { from: '2026-11-23' } } },
    ];
    parts.forEach(ensureFunctionCallId);
    const blocks = fromGeminiParts(parts);

    expect(blocks[0]).toEqual({ type: 'text', text: 'Hello!' });
    expect(blocks[1]).toMatchObject({ type: 'tool_use', name: 'get_current_time', input: {}, signature: 'SIG' });
    expect(blocks[1].id).toMatch(/^call_/);
    expect(blocks[1].nativeId).toBeUndefined();
    expect(blocks[2]).toMatchObject({ type: 'tool_use', id: 'native-9', nativeId: true });
  });

  it('attaches a signature that arrives in its own empty part', () => {
    expect(fromGeminiParts([{ text: 'Done.' }, { thoughtSignature: 'END' }])).toEqual([{ type: 'text', text: 'Done.', signature: 'END' }]);
  });
});

describe('stop reasons & usage', () => {
  const tool = [{ type: 'tool_use' }];
  it('maps finish reasons', () => {
    expect(toStopReason('STOP', [])).toBe('end_turn');
    expect(toStopReason('STOP', tool)).toBe('tool_use');
    expect(toStopReason('MAX_TOKENS', tool)).toBe('max_tokens');
    expect(toStopReason('SAFETY', [])).toBe('refusal');
    expect(() => toStopReason('MALFORMED_FUNCTION_CALL', [])).toThrow(); // agent re-runs the turn
  });

  it('maps usage (cached tokens separated, thinking counted as output)', () => {
    expect(toUsage({ promptTokenCount: 1000, cachedContentTokenCount: 400, candidatesTokenCount: 50, thoughtsTokenCount: 30 })).toEqual({
      input_tokens: 600,
      output_tokens: 80,
      cache_read_input_tokens: 400,
    });
  });
});
