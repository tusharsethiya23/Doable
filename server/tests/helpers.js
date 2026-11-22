// Test helpers: create users, parse streamed (SSE) responses, script fake Claude replies, fake a Google connection.
import request from 'supertest';
import app from '../src/app.js';
import { Integration } from '../src/models/Integration.js';
import { encrypt } from '../src/utils/crypto.js';
import { GOOGLE_SCOPES } from '../src/config/google.js';

export const api = () => request(app);

let counter = 0;

/** Registers a new user and returns { user, token, auth } where auth = the Authorization header. */
export async function createUser(overrides = {}) {
  counter += 1;
  const body = { name: 'Test User', email: `user${counter}-${Date.now()}@test.com`, password: 'password123', timezone: 'Asia/Kolkata', ...overrides };
  const res = await api().post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user: res.body.user, token: res.body.accessToken, auth: { Authorization: `Bearer ${res.body.accessToken}` }, password: body.password };
}

/** Turns a Server-Sent Events response body into [{ event, data }]. */
export function parseSSE(text) {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.includes('event:'))
    .map((chunk) => ({
      event: chunk.match(/event: (.*)/)[1],
      data: JSON.parse(chunk.match(/data: (.*)/)[1]),
    }));
}

/** POSTs to a streaming endpoint and returns the parsed events (or the JSON error if it didn't stream). */
export async function stream(path, auth, body = {}) {
  const res = await api().post(path).set(auth).send(body).buffer(true).parse((r, cb) => {
    let text = '';
    r.on('data', (c) => (text += c));
    r.on('end', () => cb(null, text));
  });
  if (!res.headers['content-type']?.includes('text/event-stream')) return { status: res.status, error: JSON.parse(res.body).message, events: [] };
  return { status: res.status, events: parseSSE(res.body) };
}

/**
 * Makes the mocked streamReply play scripted model turns, in order.
 * A turn: { text?, tools?: [{ id, name, input }], stop?, usage? }
 * Copies of the messages Claude received are kept in `sentMessages` (the agent keeps appending to the
 * original array after each call, so mock.calls would show later state).
 */
export const sentMessages = [];
export const lastSentMessages = () => sentMessages.at(-1);

export function scriptLLM(streamReplyMock, turns) {
  const queue = [...turns];
  streamReplyMock.mockImplementation(async ({ messages, onText, onToolStart }) => {
    sentMessages.push(structuredClone(messages));
    const turn = queue.shift() ?? { text: 'OK.' };
    const content = [];
    if (turn.text) {
      onText(turn.text);
      content.push({ type: 'text', text: turn.text });
    }
    for (const tool of turn.tools || []) {
      onToolStart?.({ id: tool.id, name: tool.name });
      content.push({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input });
    }
    return {
      content,
      stop_reason: turn.stop ?? (turn.tools?.length ? 'tool_use' : 'end_turn'),
      model: 'claude-opus-5-5',
      usage: turn.usage ?? { input_tokens: 1000, output_tokens: 100 },
    };
  });
}

/** Stores a fake, encrypted Google connection for a user (no real Google calls are made in tests). */
export function connectFakeGoogle(userId, email = 'me@gmail.com', scopes = Object.values(GOOGLE_SCOPES)) {
  return Integration.create({
    userId,
    provider: 'google',
    accountEmail: email,
    scopes,
    accessTokenEnc: encrypt('fake-access'),
    refreshTokenEnc: encrypt('fake-refresh'),
  });
}

export async function newConversation(auth) {
  const res = await api().post('/api/conversations').set(auth);
  return res.body.conversation;
}
