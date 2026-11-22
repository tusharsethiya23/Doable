// API tests for searching conversations by title and message text.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, createUser, newConversation } from '../helpers.js';
import { Conversation } from '../../src/models/Conversation.js';
import { Message } from '../../src/models/Message.js';

const addMessage = (conv, user, text) =>
  Message.create({ conversationId: conv.id, userId: user.id, role: 'user', content: text, text });

describe('conversation search', () => {
  let me;
  let other;
  beforeAll(async () => {
    me = await createUser();
    other = await createUser();

    const trip = await newConversation(me.auth);
    await Conversation.updateOne({ _id: trip.id }, { title: 'Goa trip planning' });
    const work = await newConversation(me.auth);
    await Conversation.updateOne({ _id: work.id }, { title: 'Work stuff' });
    await addMessage(work, me.user, 'Please email Rahul that the quarterly demo moved to Friday at 4pm.');

    const theirs = await newConversation(other.auth);
    await addMessage(theirs, other.user, 'My own quarterly demo notes');
  });

  const search = (auth, q) => api().get('/api/conversations').query({ q }).set(auth);

  it('finds chats by title', async () => {
    const res = await search(me.auth, 'goa');
    expect(res.body.conversations.map((c) => c.title)).toEqual(['Goa trip planning']);
  });

  it('finds chats by message text, with a snippet around the match', async () => {
    const res = await search(me.auth, 'QUARTERLY demo');
    expect(res.body.conversations).toHaveLength(1); // not the other user's chat
    expect(res.body.conversations[0].title).toBe('Work stuff');
    expect(res.body.conversations[0].snippet).toMatch(/quarterly demo moved to Friday/);
  });

  it('treats special characters as plain text', async () => {
    const res = await search(me.auth, '(.*)');
    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(0);
  });
});
