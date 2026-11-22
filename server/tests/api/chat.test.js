// API tests for chat + the agent loop (Claude is mocked): streaming, tools, history, locks, budgets, ownership.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, createUser, stream, scriptLLM, newConversation, lastSentMessages } from '../helpers.js';
import { streamReply } from '../../src/services/llmService.js';
import { Conversation } from '../../src/models/Conversation.js';
import { User } from '../../src/models/User.js';
import { Action } from '../../src/models/Action.js';
import { buildApiHistory } from '../../src/services/chatService.js';

// Replace the real Claude call with a scriptable fake (everything else in llmService stays real)
vi.mock('../../src/services/llmService.js', async (importOriginal) => ({ ...(await importOriginal()), streamReply: vi.fn() }));

describe('chat & agent loop', () => {
  let auth;
  let conv;
  beforeEach(async () => {
    ({ auth } = await createUser());
    conv = await newConversation(auth);
  });

  it('streams a reply and titles the chat from the first message', async () => {
    scriptLLM(streamReply, [{ text: 'Hello there!' }]);
    const { events } = await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'Hi, how are you?' });
    const names = events.map((e) => e.event);
    expect(names).toEqual(['start', 'title', 'turn_start', 'delta', 'done']);
    expect(events.find((e) => e.event === 'title').data.conversation.title).toBe('Hi, how are you?');
    expect(events.at(-1).data.messages[0].parts).toEqual([{ type: 'text', text: 'Hello there!' }]);
  });

  it('runs a tool, sends the result back, and keeps the history valid', async () => {
    scriptLLM(streamReply, [
      { text: 'Checking. ', tools: [{ id: 'tu_1', name: 'get_current_time', input: {} }] },
      { text: 'It is morning.' },
    ]);
    const { events } = await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'What time is it?' });
    expect(events.filter((e) => e.event === 'tool_result').map((e) => e.data.status)).toEqual(['success']);

    // Second model call received the tool result for tu_1
    const secondMessages = lastSentMessages();
    const lastMsg = secondMessages.at(-1);
    expect(lastMsg.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1' });
    expect(JSON.parse(lastMsg.content[0].content).timezone).toBe('Asia/Kolkata');

    const history = await buildApiHistory(conv.id);
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(await Action.countDocuments({ conversationId: conv.id, toolName: 'get_current_time', status: 'success' })).toBe(1);
  });

  it('returns errors for invalid tool input and unknown tools', async () => {
    scriptLLM(streamReply, [
      { tools: [{ id: 'a', name: 'get_current_time', input: { timezone: 'Mars/Base' } }, { id: 'b', name: 'delete_everything', input: {} }] },
      { text: 'Sorry.' },
    ]);
    await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'x' });
    const results = lastSentMessages().at(-1).content;
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(results[1].content).toMatch(/Unknown tool/);
  });

  it('stops after 10 model turns', async () => {
    scriptLLM(streamReply, Array.from({ length: 12 }, (_, i) => ({ tools: [{ id: `loop${i}`, name: 'get_current_time', input: {} }] })));
    const { events } = await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'loop' });
    expect(events.filter((e) => e.event === 'turn_start')).toHaveLength(10);
    expect(events.find((e) => e.event === 'error').data.message).toMatch(/too many steps/);
  });

  it('allows only one reply at a time per chat', async () => {
    await Conversation.updateOne({ _id: conv.id }, { status: 'running', lockedAt: new Date() });
    const res = await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'hi' });
    expect(res.status).toBe(409);

    // A lock older than 10 minutes is taken over
    await Conversation.updateOne({ _id: conv.id }, { lockedAt: new Date(Date.now() - 11 * 60000) });
    scriptLLM(streamReply, [{ text: 'Back.' }]);
    expect((await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'hi' })).status).toBe(200);
    expect((await Conversation.findById(conv.id)).status).toBe('idle'); // released afterwards
  });

  it('records usage and blocks new messages once the monthly budget is used', async () => {
    scriptLLM(streamReply, [{ text: 'Pricey.', usage: { input_tokens: 1_000_000, output_tokens: 100_000 } }]); // ≈ $6
    await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'expensive question' });
    const me = await api().get('/api/users/me').set(auth);
    expect(me.body.usage.spentUsd).toBeCloseTo(6, 5);

    const blocked = await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'again' });
    expect(blocked.status).toBe(429);
    expect(blocked.error).toMatch(/usage limit/);

    // Raising the budget unblocks
    await User.updateOne({ _id: me.body.user.id }, { monthlyBudgetUsd: 50 });
    scriptLLM(streamReply, [{ text: 'OK' }]);
    expect((await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'again' })).status).toBe(200);
  });

  it("hides other users' conversations", async () => {
    const other = await createUser();
    expect((await api().get(`/api/conversations/${conv.id}`).set(other.auth)).status).toBe(404);
    expect((await stream(`/api/conversations/${conv.id}/messages`, other.auth, { content: 'hi' })).status).toBe(404);
  });
});
