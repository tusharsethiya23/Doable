// Welcome screen for a new chat, with example prompts the user can click.
import { useAuthStore } from '../../store/authStore';

const suggestions = [
  'Draft a polite email asking my manager for Friday off',
  'Explain the difference between SQL and NoSQL',
  'Plan a 3-day study schedule for my exams',
  'Give me 5 ideas for a team-building activity',
];

export default function EmptyState({ onPick }) {
  const firstName = useAuthStore((s) => s.user?.name?.split(' ')[0]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold sm:text-3xl">Hi {firstName}, what can I do for you?</h1>
      <p className="mt-2 text-sm text-slate-500">Ask a question or try one of these:</p>
      <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left text-sm hover:border-brand-500 hover:bg-brand-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
