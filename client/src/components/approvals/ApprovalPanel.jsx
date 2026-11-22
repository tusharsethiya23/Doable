// Shows the open approval cards under the chat. If every card is decided but the agent hasn't resumed
// (e.g. the connection dropped), offers a "Continue" button.
import ApprovalCard from './ApprovalCard';
import { useChatStore } from '../../store/chatStore';

export default function ApprovalPanel() {
  const { pendingActions, awaitingApproval, isStreaming, continueRun } = useChatStore();
  if (!awaitingApproval) return null;

  const undecided = pendingActions.filter((a) => a.status === 'pending' && new Date(a.expiresAt) > Date.now());

  return (
    <div className="space-y-3 pl-10">
      {pendingActions.map((a) => (
        <ApprovalCard key={a.id} action={a} />
      ))}
      {undecided.length === 0 && !isStreaming && (
        <button onClick={continueRun} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Continue
        </button>
      )}
    </div>
  );
}
