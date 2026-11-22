// One chat turn. User messages are plain bubbles; assistant turns render their parts in order:
// Markdown text and tool chips (e.g. "Checked the time ✓"), plus typing dots, errors and a "Stopped" note.
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolChip from './ToolChip';

// Links in AI replies open in a new tab
const markdownComponents = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Assistant is typing">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="size-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

export default function MessageBubble({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white">
          {message.text}
        </div>
      </div>
    );
  }

  const parts = message.parts || [];
  const lastPart = parts.at(-1);
  // Show typing dots while waiting for the first output, or after a tool finished and the next turn hasn't started
  const showTyping = message.streaming && (!lastPart || (lastPart.type === 'tool' && lastPart.status !== 'running'));

  return (
    <div className="flex gap-3">
      <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white" aria-hidden="true">
        ✓
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {parts.map((part, i) =>
          part.type === 'tool' ? (
            <div key={part.id || i}>
              <ToolChip name={part.name} status={part.status} />
            </div>
          ) : (
            <div key={i} className="prose prose-sm prose-slate max-w-none dark:prose-invert prose-pre:bg-slate-900 prose-pre:text-slate-100">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {part.text}
              </Markdown>
            </div>
          )
        )}
        {showTyping && <TypingDots />}
        {message.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {message.error}
          </p>
        )}
        {message.status === 'stopped' && <p className="text-xs text-slate-500">Stopped</p>}
      </div>
    </div>
  );
}
