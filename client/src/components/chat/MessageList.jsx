// Scrollable list of messages; keeps the view pinned to the bottom while a reply streams in.
// One agent answer can be several saved turns (text → tool → text), so consecutive assistant turns are shown as one bubble.
import { useEffect, useMemo, useRef } from 'react';
import MessageBubble from './MessageBubble';
import ApprovalPanel from '../approvals/ApprovalPanel';
import { useChatStore } from '../../store/chatStore';
import { groupTurns } from '../../lib/groupTurns';

export default function MessageList({ messages }) {
  const containerRef = useRef(null);
  const stickToBottom = useRef(true);
  const groups = useMemo(() => groupTurns(messages), [messages]);
  const pendingActions = useChatStore((s) => s.pendingActions);

  // Only auto-scroll if the user hasn't scrolled up to read older messages
  const onScroll = () => {
    const el = containerRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingActions]);

  return (
    <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {groups.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <ApprovalPanel />
      </div>
    </div>
  );
}
