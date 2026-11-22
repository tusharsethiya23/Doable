// API tests for deleting your own account: confirmation is required and all your data is removed.
import { describe, it, expect } from 'vitest';
import { api, createUser, newConversation } from '../helpers.js';
import { User } from '../../src/models/User.js';
import { Conversation } from '../../src/models/Conversation.js';

describe('delete account', () => {
  it('requires the correct password, then removes the user and their data', async () => {
    const { user, auth, password } = await createUser();
    await newConversation(auth);

    const noConfirm = await api().delete('/api/users/me').set(auth).send({});
    expect(noConfirm.status).toBe(400);
    const wrong = await api().delete('/api/users/me').set(auth).send({ password: 'not-my-password' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe('Password is incorrect');

    const ok = await api().delete('/api/users/me').set(auth).send({ password });
    expect(ok.status).toBe(200);
    expect(await User.findById(user.id)).toBeNull();
    expect(await Conversation.countDocuments({ userId: user.id })).toBe(0);
    expect((await api().post('/api/auth/login').send({ email: user.email, password })).status).toBe(401);
  });

  it('asks accounts without a password (Google sign-in) to type their email', async () => {
    const { user, auth } = await createUser();
    await User.updateOne({ _id: user.id }, { $unset: { passwordHash: 1 }, authProvider: 'google' });

    expect((await api().delete('/api/users/me').set(auth).send({ confirmEmail: 'someone@else.com' })).status).toBe(400);
    expect((await api().delete('/api/users/me').set(auth).send({ confirmEmail: user.email.toUpperCase() })).status).toBe(200);
  });
});
