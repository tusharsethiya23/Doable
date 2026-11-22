// One chat message. User messages are plain bubbles; assistant replies render Markdown (tables, code, lists).
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

  const isError = message.status === 'error';

  return (
    <div className="flex gap-3">
      <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white" aria-hidden="true">
        ✓
      </div>
      <div className="min-w-0 flex-1">
        {message.streaming && !message.text ? (
          <TypingDots />
        ) : isError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {message.text}
          </p>
        ) : (
          <div className="prose prose-sm prose-slate max-w-none dark:prose-invert prose-pre:bg-slate-900 prose-pre:text-slate-100">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.text}
            </Markdown>
          </div>
        )}
        {message.status === 'stopped' && <p className="mt-1 text-xs text-slate-500">Stopped</p>}
      </div>
    </div>
  );
}
