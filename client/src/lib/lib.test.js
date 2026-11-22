// Unit tests for client helpers: SSE stream parsing, grouping agent turns, tool labels.
import { describe, it, expect } from 'vitest';
import { readSSE } from './sse';
import { groupTurns } from './groupTurns';
import { toolLabel } from './toolLabels';

// Builds a ReadableStream that delivers the given string chunks (like a network response body)
const streamOf = (chunks) =>
  new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(new TextEncoder().encode(c)));
      controller.close();
    },
  });

describe('readSSE', () => {
  it('parses events even when they are split across network chunks', async () => {
    const events = [];
    await readSSE(streamOf(['event: delta\ndata: {"te', 'xt":"Hi"}\n\nevent: done\n', 'data: {"ok":true}\n\n']), (e, d) => events.push([e, d]));
    expect(events).toEqual([
      ['delta', { text: 'Hi' }],
      ['done', { ok: true }],
    ]);
  });

  it('ignores keep-alive comments', async () => {
    const events = [];
    await readSSE(streamOf([': ping\n\nevent: ready\ndata: {}\n\n']), (e) => events.push(e));
    expect(events).toEqual(['ready']);
  });
});

describe('groupTurns', () => {
  it('merges consecutive assistant turns into one bubble', () => {
    const groups = groupTurns([
      { id: 'u', role: 'user', text: 'time?' },
      { id: 'a1', role: 'assistant', parts: [{ type: 'tool', id: 't', name: 'get_current_time', status: 'success' }] },
      { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: '10 AM' }], status: 'complete' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].parts.map((p) => p.type)).toEqual(['tool', 'text']);
  });
});

describe('toolLabel', () => {
  it('describes running, finished and not-done actions', () => {
    expect(toolLabel('send_email', 'running')).toBe('Sending email');
    expect(toolLabel('send_email', 'success')).toBe('Sent email');
    expect(toolLabel('send_email', 'pending')).toBe('Send email — waiting for your approval');
    expect(toolLabel('unknown_tool', 'success')).toBe('Used unknown_tool');
  });
});
