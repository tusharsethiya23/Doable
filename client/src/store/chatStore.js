// Chat state (Zustand): sidebar conversations, the open conversation's messages, and the streaming reply.
import { create } from 'zustand';
import * as chatApi from '../services/chatService';
import { getErrorMessage } from '../lib/api';

export const useChatStore = create((set, get) => ({
  conversations: [],
  activeId: null, // id of the open conversation (null = new, unsaved chat)
  messages: [], // [{ id, role, text, status, streaming? }]
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
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const abortController = new AbortController();
    set((s) => ({
      isStreaming: true,
      abortController,
      messages: [
        ...s.messages,
        { id: tempUserId, role: 'user', text },
        { id: tempAssistantId, role: 'assistant', text: '', streaming: true },
      ],
    }));

    // Small helper to update one message in the list
    const patchMessage = (id, patch) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
    let assistantId = tempAssistantId;

    try {
      await chatApi.streamMessage(conversationId, text, {
        signal: abortController.signal,
        onEvent: (event, data) => {
          if (event === 'start') patchMessage(tempUserId, data.userMessage);
          else if (event === 'title') get().upsertConversation(data.conversation);
          else if (event === 'delta')
            set((s) => ({ messages: s.messages.map((m) => (m.id === assistantId ? { ...m, text: m.text + data.text } : m)) }));
          else if (event === 'done') {
            patchMessage(assistantId, { ...data.message, streaming: false });
            assistantId = data.message.id;
          } else if (event === 'error') patchMessage(assistantId, { streaming: false, status: 'error', text: data.message });
        },
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        patchMessage(assistantId, { streaming: false, status: 'stopped' });
      } else {
        patchMessage(assistantId, { streaming: false, status: 'error', text: getErrorMessage(err) });
      }
    } finally {
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
