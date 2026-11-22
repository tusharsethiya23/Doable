// Tests for reminders and scheduled agent tasks: firing, repeating, safe auto-approval, budgets, disabled users.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { api, createUser, stream, scriptLLM, newConversation, connectFakeGoogle } from '../helpers.js';
import { streamReply } from '../../src/services/llmService.js';
import { getTool } from '../../src/tools/index.js';
import { tick } from '../../src/services/schedulerService.js';
import { ScheduledTask } from '../../src/models/ScheduledTask.js';
import { Notification } from '../../src/models/Notification.js';
import { User } from '../../src/models/User.js';

vi.mock('../../src/services/llmService.js', async (importOriginal) => ({ ...(await importOriginal()), streamReply: vi.fn() }));

const sendEmail = getTool('send_email');
const originalSend = sendEmail.run;
const sendRun = vi.fn(async (input) => ({ sent: true, to: input.to }));
sendEmail.run = sendRun;
afterAll(() => {
  sendEmail.run = originalSend;
});

const makeDue = (filter) => ScheduledTask.updateOne(filter, { runAt: new Date(Date.now() - 1000) });
// A local time (Asia/Kolkata) `minutes` from now, as the model would write it
const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000 + 5.5 * 3600000).toISOString().slice(0, 16);

describe('scheduler', () => {
  let user;
  let auth;
  let conv;
  beforeEach(async () => {
    ({ user, auth } = await createUser());
    await connectFakeGoogle(user.id, 'me@gmail.com');
    conv = await newConversation(auth);
    sendRun.mockClear();
  });

  it('creates reminders, fires them as notifications, and repeats on schedule', async () => {
    scriptLLM(streamReply, [
      {
        tools: [
          { id: 'r1', name: 'create_reminder', input: { message: 'Submit the report', at: inMinutes(30) } },
          { id: 'r2', name: 'create_reminder', input: { message: 'Past', at: '2020-01-01T10:00' } },
          { id: 'r3', name: 'create_reminder', input: { message: 'Stand up', repeat: '0 9 * * 1-5' } },
        ],
      },
      { text: 'Done' },
    ]);
    const { events } = await stream(`/api/conversations/${conv.id}/messages`, auth, { content: 'remind me' });
    expect(events.filter((e) => e.event === 'tool_result').map((e) => e.data.status)).toEqual(['success', 'failed', 'success']);

    await makeDue({ title: 'Submit the report' });
    await tick();
    const once = await ScheduledTask.findOne({ title: 'Submit the report' });
    expect(once).toMatchObject({ state: 'done', lastStatus: 'success', runCount: 1 });
    expect(await Notification.findOne({ userId: user.id, type: 'reminder' })).toBeTruthy();

    await makeDue({ title: 'Stand up' });
    await tick();
    const repeating = await ScheduledTask.findOne({ title: 'Stand up' });
    expect(repeating.state).toBe('scheduled');
    expect(repeating.runAt > new Date()).toBe(true);
  });

  it('runs agent tasks: emails to the user are pre-approved, anything else waits for approval', async () => {
    await ScheduledTask.create({
      userId: user.id,
      kind: 'agent_task',
      title: 'Weekly agenda',
      instruction: 'Email me my meetings.',
      cron: '0 9 * * 1',
      timezone: 'Asia/Kolkata',
      runAt: new Date(Date.now() - 1000),
      allowEmailToMe: true,
    });

    scriptLLM(streamReply, [{ tools: [{ id: 'a1', name: 'send_email', input: { to: ['me@gmail.com'], subject: 'Agenda', body: '...' } }] }, { text: 'Emailed you.' }]);
    await tick();
    let task = await ScheduledTask.findOne({ title: 'Weekly agenda' });
    expect(task.lastStatus).toBe('success');
    expect(sendRun).toHaveBeenCalledTimes(1);

    await makeDue({ _id: task._id });
    scriptLLM(streamReply, [{ tools: [{ id: 'a2', name: 'send_email', input: { to: ['boss@x.com'], subject: 'Agenda', body: '...' } }] }]);
    await tick();
    task = await ScheduledTask.findById(task._id);
    expect(task.lastStatus).toBe('needs_approval');
    expect(sendRun).toHaveBeenCalledTimes(1); // not sent
    expect(await Notification.findOne({ userId: user.id, type: 'approval_needed' })).toBeTruthy();
  });

  it('skips agent tasks when over budget or when the account is disabled', async () => {
    const task = await ScheduledTask.create({
      userId: user.id,
      kind: 'agent_task',
      title: 'Daily digest',
      instruction: 'Summarise.',
      cron: '0 8 * * *',
      timezone: 'Asia/Kolkata',
      runAt: new Date(Date.now() - 1000),
    });
    await User.updateOne({ _id: user.id }, { monthlyBudgetUsd: 0 });
    streamReply.mockClear();
    await tick();
    expect(streamReply).not.toHaveBeenCalled();
    expect((await ScheduledTask.findById(task._id)).lastStatus).toBe('failed');
    expect((await Notification.findOne({ userId: user.id, type: 'task_failed' })).body).toMatch(/usage limit/);

    await User.updateOne({ _id: user.id }, { monthlyBudgetUsd: 50, disabled: true });
    await makeDue({ _id: task._id });
    await tick();
    expect(streamReply).not.toHaveBeenCalled();
  });

  it('lets users pause, resume and delete tasks', async () => {
    const task = await ScheduledTask.create({ userId: user.id, kind: 'reminder', title: 'Water plants', cron: '0 18 * * *', timezone: 'UTC', runAt: new Date(Date.now() + 3600e3) });
    expect((await api().patch(`/api/tasks/${task.id}`).set(auth).send({ enabled: false })).body.task.enabled).toBe(false);
    expect((await api().patch(`/api/tasks/${task.id}`).set(auth).send({ enabled: true })).body.task.enabled).toBe(true);
    expect((await api().delete(`/api/tasks/${task.id}`).set(auth)).status).toBe(200);
    expect(await ScheduledTask.findById(task.id)).toBeNull();
  });
});
