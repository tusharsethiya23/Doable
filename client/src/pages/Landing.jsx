// Public home page: short product pitch with sign-up / log-in buttons.
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { APP_TAGLINE } from '../config';
import { useAuthStore } from '../store/authStore';

const features = [
  { title: 'Send emails', text: '“Email Rahul that the demo moves to Friday.” Drafted, shown to you, sent.' },
  { title: 'Book meetings', text: '“Find 30 minutes with Priya tomorrow.” Checks your calendar and books it.' },
  { title: 'Set reminders', text: '“Remind me to submit the report at 5 PM.” Done.' },
];

export default function Landing() {
  const isAuthed = useAuthStore((s) => s.status === 'authenticated');

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          {isAuthed ? (
            <Link to="/chat" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
              Open app
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-lg px-4 py-2 font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                Log in
              </Link>
              <Link to="/register" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">{APP_TAGLINE}</h1>
        <p className="mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-400">
          An AI assistant that doesn’t just answer questions — it sends your emails, books your meetings and keeps
          your reminders. You approve every action.
        </p>
        <Link
          to={isAuthed ? '/chat' : '/register'}
          className="mt-8 rounded-lg bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700"
        >
          {isAuthed ? 'Go to chat' : 'Try it free'}
        </Link>

        <div className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
