// The scheduler: every 15 seconds it claims due reminders/tasks from MongoDB and runs them.
// - Claiming uses an atomic update, so several server instances never run the same task twice.
// - Tasks stuck in "running" (server crashed mid-run) are released after 10 minutes.
// - Reminders → notification (+ optional email). Agent tasks → the agent runs the instruction in the task's own chat.
import { ScheduledTask } from '../models/ScheduledTask.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { Integration } from '../models/Integration.js';
import { GOOGLE_SCOPES } from '../config/google.js';
import { notify, publishConversationUpdate } from './notificationService.js';
import { runAgent, finalizePausedTurn } from './agentService.js';
import { buildApiHistory, lockConversation, unlockConversation } from './chatService.js';
import { assertWithinBudget } from './usageService.js';
import { ApiError } from '../utils/ApiError.js';
import { withGmail, buildRawEmail, formatFrom } from './gmailService.js';
import { nextCronRun } from '../utils/schedule.js';
import { formatInZone } from '../utils/time.js';
import { logError } from '../utils/logger.js';

const TICK_MS = 15 * 1000;
const STALE_LOCK_MS = 10 * 60 * 1000;
const MAX_PER_TICK = 10;

let timer = null;
let ticking = false;

export function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  tick();
  console.log('⏰ Scheduler started');
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}

/** One pass: release stale locks, then claim and run due tasks. Exported for tests. */
export async function tick() {
  if (ticking) return; // previous tick still running
  ticking = true;
  try {
    await ScheduledTask.updateMany(
      { state: 'running', lockedAt: { $lt: new Date(Date.now() - STALE_LOCK_MS) } },
      { state: 'scheduled', $unset: { lockedAt: 1 } }
    );

    const runs = [];
    for (let i = 0; i < MAX_PER_TICK; i++) {
      const task = await ScheduledTask.findOneAndUpdate(
        { state: 'scheduled', enabled: true, runAt: { $lte: new Date() } },
        { state: 'running', lockedAt: new Date() },
        { sort: { runAt: 1 }, returnDocument: 'after' }
      );
      if (!task) break;
      runs.push(runTask(task));
    }
    await Promise.all(runs);
  } catch (err) {
    logError('Scheduler tick failed', err);
  } finally {
    ticking = false;
  }
}

// Runs one claimed task, records the outcome and schedules the next run
async function runTask(task) {
  let status = 'success';
  let error;
  try {
    const user = await User.findById(task.userId);
    if (!user) return task.deleteOne(); // account deleted
    if (user.disabled) throw new ApiError(403, 'Account is disabled');
    status = task.kind === 'reminder' ? await deliverReminder(task, user) : await runAgentTask(task, user);
  } catch (err) {
    logError(`Scheduled task ${task.id} failed`, err);
    status = 'failed';
    error = err.message;
    await notify(task.userId, {
      type: 'task_failed',
      title: `Task failed: ${task.title}`,
      // Our own errors (budget used up, chat busy…) are safe and useful to show; others stay generic
      body: err instanceof ApiError ? err.message : 'Something went wrong while running it. It will try again at the next scheduled time.',
      link: task.conversationId ? `/chat/${task.conversationId}` : '/tasks',
    }).catch(() => {});
  }

  task.lastRunAt = new Date();
  task.lastStatus = status;
  task.lastError = error;
  task.runCount += 1;
  task.lockedAt = undefined;
  if (task.cron) {
    task.runAt = nextCronRun(task.cron, task.timezone); // next future occurrence (missed ones are skipped)
    task.state = 'scheduled';
  } else {
    task.state = 'done';
  }
  await task.save();
}

// ---------- Reminders ----------

async function deliverReminder(task, user) {
  await notify(user._id, {
    type: 'reminder',
    title: `⏰ ${task.title}`,
    body: `Reminder set for ${formatInZone(task.runAt, task.timezone)}`,
    link: task.sourceConversationId ? `/chat/${task.sourceConversationId}` : '/tasks',
  });
  if (task.emailMe) await emailReminder(task, user);
  return 'success';
}

// Emails the reminder to the user's own connected Gmail address (best effort: the in-app one already went out)
async function emailReminder(task, user) {
  try {
    const google = await Integration.findOne({ userId: user._id, provider: 'google', status: 'active' });
    if (!google) return;
    await withGmail(user, [GOOGLE_SCOPES.gmailCompose], ({ gmail, integration }) => {
      const raw = buildRawEmail({
        from: formatFrom(user.name, integration.accountEmail),
        to: [integration.accountEmail],
        subject: `Reminder: ${task.title}`.replace(/[\r\n]+/g, ' '),
        body: `${task.title}\n\n(Reminder from your assistant, ${formatInZone(task.runAt, task.timezone)})`,
      });
      return gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    });
  } catch (err) {
    console.warn(`Reminder email failed for task ${task.id}:`, err.message);
  }
}

// ---------- Agent tasks ----------

/**
 * Only pre-approved action for unattended runs: emailing the user's OWN address (if allowed on the task).
 * Everything else that changes something waits for approval, and the user is notified.
 */
function makeAutoApprove(task, accountEmail) {
  return (tool, input) => {
    if (!task.allowEmailToMe || tool.name !== 'send_email' || !accountEmail) return false;
    const recipients = [...(input.to || []), ...(input.cc || []), ...(input.bcc || [])].map((e) => e.toLowerCase());
    return recipients.length > 0 && recipients.every((e) => e === accountEmail.toLowerCase());
  };
}

async function runAgentTask(task, user) {
  await assertWithinBudget(user._id); // scheduled runs count towards the monthly AI budget too

  // Each task posts its runs into its own conversation (created on first run)
  let conversation = task.conversationId && (await Conversation.findOne({ _id: task.conversationId, userId: user._id }));
  if (!conversation) {
    conversation = await Conversation.create({ userId: user._id, title: `⏰ ${task.title}`.slice(0, 120) });
    task.conversationId = conversation._id;
  }
  // A previous run still waiting for approval is closed first (its undecided actions are not done);
  // then the chat is locked so the user can't type into it while the task runs
  const finalized =
    conversation.status === 'awaiting_approval' && (await finalizePausedTurn({ user, conversation, emit: () => {}, keepLocked: true }));
  if (!finalized) await lockConversation(conversation._id);
  try {
    return await runLockedAgentTask(task, user, conversation);
  } finally {
    await unlockConversation(conversation._id);
  }
}

async function runLockedAgentTask(task, user, conversation) {
  const runTime = formatInZone(new Date(), task.timezone);
  const text = `[Scheduled task "${task.title}" — ${runTime}. The user is not watching this chat right now: don't ask questions, make sensible assumptions and finish the task. Actions that change things will wait for their approval${task.allowEmailToMe ? ', except emails to their own address, which are pre-approved' : ''}.]\n\n${task.instruction}`;
  await Message.create({ conversationId: conversation._id, userId: user._id, role: 'user', content: text, text });
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const google = await Integration.findOne({ userId: user._id, provider: 'google', status: 'active' });
  const history = await buildApiHistory(conversation._id);
  const { messages, awaitingApproval } = await runAgent({
    user,
    conversation,
    history,
    signal: new AbortController().signal, // nobody can press Stop on a background run
    emit: () => {},
    autoApprove: makeAutoApprove(task, google?.accountEmail),
  });

  publishConversationUpdate(user._id, conversation._id);
  const link = `/chat/${conversation._id}`;
  if (awaitingApproval) {
    await notify(user._id, { type: 'approval_needed', title: `Approval needed: ${task.title}`, body: 'Your scheduled task wants to do something. Open it to approve or reject.', link });
    return 'needs_approval';
  }
  const summary = messages.map((m) => m.text).filter(Boolean).join(' ').trim();
  await notify(user._id, { type: 'task_done', title: `Done: ${task.title}`, body: summary.slice(0, 300) || 'Finished.', link });
  return 'success';
}
