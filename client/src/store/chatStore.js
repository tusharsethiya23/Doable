// Chat state (Zustand): sidebar conversations, the open conversation's messages, and the streaming reply.
import { create } from 'zustand';
import * as chatApi from '../services/chatService';
import { getErrorMessage } from '../lib/api';

export const useChatStore = create((set, get) => ({
  conversations: [],
  activeId: null, // id of the open conversation (null = new, unsaved chat)
  messages: [], // user: { id, role, text }   assistant: { id, role, parts, status, streaming?, error? }
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

  // Open an existing conversation and load its messages
  async openConversation(id) {
    get().stop();
    set({ activeId: id, messages: [], loadingMessages: true, error: '' });
    try {
      const { messages } = await chatApi.getConversation(id);
      if (get().activeId === id) set({ messages }); // ignore if the user already switched chats
    } catch (err) {
      set({ error: getErrorMessage(err) });
    } finally {
      set({ loadingMessages: false });
    }
  },

  // Start a fresh, empty chat (created on the server when the first message is sent)
  newChat() {
    get().stop();
    set({ activeId: null, messages: [], error: '' });
  },

  /**
   * Sends a message and streams the reply into the last message.
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

    // Show the user's message and an empty assistant bubble immediately
    const tempUserId = `temp-user-${Date.now()}`;
    const liveId = `live-assistant-${Date.now()}`;
    const abortController = new AbortController();
    set((s) => ({
      isStreaming: true,
      abortController,
      messages: [
        ...s.messages,
        { id: tempUserId, role: 'user', text },
        { id: liveId, role: 'assistant', parts: [], streaming: true },
      ],
    }));

    // Helpers that update one message / the live assistant bubble
    const patchMessage = (id, patch) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
    const updateLive = (fn) => set((s) => ({ messages: s.messages.map((m) => (m.id === liveId ? { ...m, ...fn(m) } : m)) }));
    let turnStart = 0; // where the current model turn's parts begin (to undo a turn if the server re-runs it)

    try {
      await chatApi.streamMessage(conversationId, text, {
        signal: abortController.signal,
        onEvent: (event, data) => {
          switch (event) {
            case 'start':
              patchMessage(tempUserId, data.userMessage);
              break;
            case 'title':
              get().upsertConversation(data.conversation);
              break;
            case 'turn_start':
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
              updateLive((m) => ({ parts: m.parts.map((p) => (p.id === data.id ? { ...p, status: data.status } : p)) }));
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
      updateLive(() => ({ streaming: false }));
      set({ isStreaming: false, abortController: null });
      get().bumpConversation(conversationId);
    }
    return conversationId;
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
    set({ conversations: [], activeId: null, messages: [], error: '', isStreaming: false });
  },
}));
