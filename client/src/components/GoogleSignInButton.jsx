// "Continue with Google" button for the login/register pages. It's a full page navigation (not an API call):
// the server redirects to Google and, after sign-in, back to /chat with the session cookie set.
import GoogleIcon from './GoogleIcon';
import { API_URL } from '../config';

export default function GoogleSignInButton() {
  return (
    <>
      <a
        href={`${API_URL}/auth/google`}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      >
        <GoogleIcon /> Continue with Google
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
    </>
  );
}
