// Message input box: Enter sends, Shift+Enter adds a new line, and a Stop button appears while the AI is replying.
import { useEffect, useRef, useState } from 'react';

const MAX_LENGTH = 10000;

export default function Composer({ onSend, onStop, isStreaming }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  // Grow the textarea with its content (up to ~8 lines)
  useEffect(() => {
    const el = textareaRef.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 pb-4 pt-3 dark:border-slate-800 dark:bg-slate-950">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
      >
        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          autoFocus
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything…"
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {isStreaming ? (
          <button type="button" onClick={onStop} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900" aria-label="Stop generating">
            ■ Stop
          </button>
        ) : (
          <button type="submit" disabled={!text.trim()} className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40" aria-label="Send message">
            Send ↑
          </button>
        )}
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-slate-500">AI can make mistakes. Check important info.</p>
    </div>
  );
}
