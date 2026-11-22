// Main chat page (/chat and /chat/:id): sidebar + messages + input box. Syncs the open chat with the URL.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/chat/Sidebar';
import MessageList from '../components/chat/MessageList';
import Composer from '../components/chat/Composer';
import EmptyState from '../components/chat/EmptyState';
import Spinner from '../components/Spinner';
import { useChatStore } from '../store/chatStore';

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { conversations, activeId, messages, loadingMessages, isStreaming, error } = useChatStore();
  const { loadConversations, openConversation, newChat, send, stop } = useChatStore.getState();

  // Load the sidebar list once
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // When the URL changes, open that chat (skip if it's already open, e.g. a chat we just created)
  useEffect(() => {
    if (!id) newChat();
    else if (id !== useChatStore.getState().activeId) openConversation(id);
  }, [id, openConversation, newChat]);

  // When a new chat gets its id (first message sent), put it in the URL.
  // Reads the store directly so it sees the value set by newChat() in the effect above.
  useEffect(() => {
    const currentId = useChatStore.getState().activeId;
    if (currentId && !id) navigate(`/chat/${currentId}`, { replace: true });
  }, [activeId, id, navigate]);

  const onSend = (text) => send(text);

  const title = conversations.find((c) => c.id === activeId)?.title || 'New chat';

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label="Open sidebar">
            ☰
          </button>
          <h2 className="truncate text-sm font-medium">{title}</h2>
        </header>

        {error && (
          <p role="alert" className="mx-auto mt-3 w-full max-w-3xl rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        {loadingMessages ? (
          <div className="grid flex-1 place-items-center">
            <Spinner className="size-6 text-brand-600" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState onPick={onSend} />
        ) : (
          <MessageList messages={messages} />
        )}

        <Composer onSend={onSend} onStop={stop} isStreaming={isStreaming} />
      </main>
    </div>
  );
}
