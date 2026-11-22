// API test for the daily message limit that protects the shared free AI quota.
// The limit is set to 2 BEFORE the app is loaded (env is read once at startup), so imports are dynamic.
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../../src/services/llmService.js', async (importOriginal) => ({ ...(await importOriginal()), streamReply: vi.fn() }));

let helpers;
let streamReply;
beforeAll(async () => {
  process.env.DAILY_MESSAGE_LIMIT = '2';
  helpers = await import('../helpers.js');
  ({ streamReply } = await import('../../src/services/llmService.js'));
});

describe('daily message limit', () => {
  it('allows N messages per day, then returns 429', async () => {
    const { auth } = await helpers.createUser();
    const conv = await helpers.newConversation(auth);
    helpers.scriptLLM(streamReply, [{ text: 'one' }, { text: 'two' }]);

    expect((await helpers.stream(`/api/conversations/${conv.id}/messages`, auth, { content: '1' })).status).toBe(200);
    expect((await helpers.stream(`/api/conversations/${conv.id}/messages`, auth, { content: '2' })).status).toBe(200);
    const third = await helpers.stream(`/api/conversations/${conv.id}/messages`, auth, { content: '3' });
    expect(third.status).toBe(429);
    expect(third.error).toMatch(/today's limit of 2 messages/);
  });
});
