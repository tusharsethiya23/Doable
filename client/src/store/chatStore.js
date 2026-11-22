// Chat state (Zustand): sidebar conversations, the open conversation's messages, the streaming reply,
// and approval cards (actions waiting for the user's Approve / Edit / Reject).
import { create } from 'zustand';
import * as chatApi from '../services/chatService';
import { getErrorMessage } from '../lib/api';

export const useChatStore = create((set, get) => ({
  conversations: [],
  activeId: null, // id of the open conversation (null = new, unsaved chat)
  messages: [], // user: { id, role, text }   assistant: { id, role, parts, status, streaming?, error? }
  pendingActions: [], // approval cards: { id, toolName, preview, status, expiresAt, input, ... }
  awaitingApproval: false, // the agent is paused until the user decides
  searchResults: null, // null = not searching; [] = searched, nothing found
  searching: false,
  loadingMessages: false,
  isStreaming: false,
  error: '',
  abortController: null,

  async loadConversations() {
    try {
      set({ conversations: await chatApi.listConversations() });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  // Search chats by title and message text; an empty query clears the search
  async search(query) {
    const q = query.trim();
    if (!q) return set({ searchResults: null, searching: false });
    set({ searching: true });
    try {
      const results = await chatApi.listConversations(q);
      set({ searchResults: results });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    } finally {
      set({ searching: false });
    }
  },

  // Open an existing conversation and load its messages (and any approval cards still open)
  async openConversation(id) {
    get().stop();
    set({ activeId: id, messages: [], pendingActions: [], awaitingApproval: false, loadingMessages: true, error: '' });
    try {
      const { messages, conversation, pendingActions } = await chatApi.getConversation(id);
      if (get().activeId === id) {
        set({ messages, pendingActions, awaitingApproval: conversation.status === 'awaiting_approval' });
      }
    } catch (err) {
      set({ error: getErrorMessage(err) });
    } finally {
      set({ loadingMessages: false });
    }
  },

  // Start a fresh, empty chat (created on the server when the first message is sent)
  newChat() {
    get().stop();
    set({ activeId: null, messages: [], pendingActions: [], awaitingApproval: false, error: '' });
  },

  /**
   * Sends a message and streams the reply.
   * Returns the conversation id (new chats get an id here) so the page can update the URL.
   */
  async send(text) {
    if (get().isStreaming) return get().activeId;
    set({ error: '' });

    let conversationId = get().activeId;
    if (!conversationId) {
      try {
        const conversation = await chatApi.createConversation();
        conversationId = conversation.id;
        set((s) => ({ activeId: conversationId, conversations: [conversation, ...s.conversations] }));
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return null;
      }
    }

    // Show the user's message right away (replaced by the saved one when the server confirms)
    const tempUserId = `temp-user-${Date.now()}`;
    set((s) => ({ messages: [...s.messages, { id: tempUserId, role: 'user', text }] }));

    await get().runStream(conversationId, (opts) => chatApi.streamMessage(conversationId, text, opts), { tempUserId });
    return conversationId;
  },

  // Approve / reject one approval card. When none are left undecided, the agent continues automatically.
  async decide(actionId, decision, input) {
    const updateCard = (patch) => set((s) => ({ pendingActions: s.pendingActions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) }));
    updateCard({ submitting: true, error: '' });
    try {
      const { action, remaining } = await chatApi.decideAction(actionId, decision, input);
      updateCard({ ...action, submitting: false });
      if (remaining === 0) await get().continueRun();
    } catch (err) {
      updateCard({ submitting: false, error: getErrorMessage(err) });
      throw err;
    }
  },

  // Resume the paused agent: runs approved actions and streams the rest of its answer
  async continueRun() {
    const conversationId = get().activeId;
    if (!conversationId || get().isStreaming) return;
    await get().runStream(conversationId, (opts) => chatApi.continueConversation(conversationId, opts), { closesApprovals: true });
  },

  /**
   * Shared streaming logic for "send" and "continue": adds a live assistant bubble and applies server events.
   * @param {string} conversationId
   * @param {(opts: { signal, onEvent }) => Promise<void>} start - starts the request
   */
  async runStream(conversationId, start, { tempUserId, closesApprovals } = {}) {
    const liveId = `live-assistant-${Date.now()}`;
    const abortController = new AbortController();
    set((s) => ({
      isStreaming: true,
      abortController,
      messages: [...s.messages, { id: liveId, role: 'assistant', parts: [], streaming: true }],
    }));

    // Helpers that update one message / the live assistant bubble / a tool chip anywhere in the chat
    const patchMessage = (id, patch) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
    const updateLive = (fn) => set((s) => ({ messages: s.messages.map((m) => (m.id === liveId ? { ...m, ...fn(m) } : m)) }));
    const updateToolPart = (toolId, patch) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.parts?.some((p) => p.id === toolId) ? { ...m, parts: m.parts.map((p) => (p.id === toolId ? { ...p, ...patch } : p)) } : m)),
      }));
    let turnStart = 0; // where the current model turn's parts begin (to undo a turn if the server re-runs it)

    try {
      await start({
        signal: abortController.signal,
        onEvent: (event, data) => {
          switch (event) {
            case 'start':
              if (tempUserId) patchMessage(tempUserId, data.userMessage);
              break;
            case 'title':
              get().upsertConversation(data.conversation);
              break;
            case 'approvals_closed': // user moved on without deciding: open cards are dropped
              set({ pendingActions: [], awaitingApproval: false });
              break;
            case 'turn_start':
              if (closesApprovals) set({ pendingActions: [], awaitingApproval: false });
              updateLive((m) => {
                turnStart = m.parts.length;
                return {};
              });
              break;
            case 'turn_reset':
              updateLive((m) => ({ parts: m.parts.slice(0, turnStart) }));
              break;
            case 'delta':
              updateLive((m) => {
                const last = m.parts.at(-1);
                return last?.type === 'text'
                  ? { parts: [...m.parts.slice(0, -1), { ...last, text: last.text + data.text }] }
                  : { parts: [...m.parts, { type: 'text', text: data.text }] };
              });
              break;
            case 'tool_start':
              updateLive((m) => ({ parts: [...m.parts, { type: 'tool', id: data.id, name: data.name, status: 'running' }] }));
              break;
            case 'tool_result':
              updateToolPart(data.id, { status: data.status, ...(data.needsIntegration && { needsIntegration: data.needsIntegration }) });
              break;
            case 'approval_required':
              set({ pendingActions: data.actions, awaitingApproval: true });
              break;
            case 'error':
              updateLive(() => ({ error: data.message }));
              break;
            case 'done':
              // Swap the live bubble for the saved turns; keep any error (e.g. "too many steps") visible
              set((s) => {
                const live = s.messages.find((m) => m.id === liveId);
                const extra = live?.error ? [{ id: `${liveId}-error`, role: 'assistant', parts: [], error: live.error }] : [];
                return { messages: s.messages.flatMap((m) => (m.id === liveId ? [...data.messages, ...extra] : [m])) };
              });
              break;
          }
        },
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        // Tools that were mid-run when the user pressed Stop
        updateLive((m) => ({ status: 'stopped', parts: m.parts.map((p) => (p.status === 'running' ? { ...p, status: 'stopped' } : p)) }));
      } else {
        updateLive(() => ({ error: getErrorMessage(err) }));
      }
    } finally {
      // Remove the live bubble if nothing was streamed into it (e.g. a resume that only ran actions), else freeze it
      set((s) => ({
        messages: s.messages
          .filter((m) => !(m.id === liveId && !m.parts.length && !m.error && m.status !== 'stopped'))
          .map((m) => (m.id === liveId ? { ...m, streaming: false } : m)),
        isStreaming: false,
        abortController: null,
      }));
      get().bumpConversation(conversationId);
    }
  },

  // Cancel the reply that is currently streaming (the server stops the AI request too)
  stop() {
    get().abortController?.abort();
  },

  async rename(id, title) {
    try {
      get().upsertConversation(await chatApi.renameConversation(id, title));
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  async remove(id) {
    try {
      await chatApi.deleteConversation(id);
      set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }));
      if (get().activeId === id) get().newChat();
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  // Replace (or add) a conversation in the sidebar list
  upsertConversation(conversation) {
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conversation.id);
      return {
        conversations: exists
          ? s.conversations.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c))
          : [conversation, ...s.conversations],
      };
    });
  },

  // Move a conversation to the top of the sidebar after new activity
  bumpConversation(id) {
    set((s) => {
      const conv = s.conversations.find((c) => c.id === id);
      if (!conv) return {};
      return { conversations: [{ ...conv, lastMessageAt: new Date().toISOString() }, ...s.conversations.filter((c) => c.id !== id)] };
    });
  },

  // Forget everything (used on logout)
  reset() {
    get().stop();
    set({ conversations: [], activeId: null, messages: [], pendingActions: [], awaitingApproval: false, error: '', isStreaming: false });
  },
}));
