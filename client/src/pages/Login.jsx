// Login page: "Continue with Google" or email + password; on success returns the user to the page they wanted (or /chat).
// If Google sign-in failed, the server sends the browser back here with ?error=<reason>.
import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import FormField from '../components/FormField';
import SubmitButton from '../components/SubmitButton';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { login } from '../services/authService';
import { getErrorMessage } from '../lib/api';

// Friendly text for the reasons the server can send back after a failed Google sign-in
const GOOGLE_ERRORS = {
  access_denied: 'Google sign-in was cancelled.',
  disabled: 'This account has been disabled. Contact the administrator.',
  email_not_verified: 'Your Google email address isn’t verified.',
  browser_mismatch: 'Please start Google sign-in again from this browser.',
  invalid_state: 'The sign-in link expired. Please try again.',
  google_unavailable: 'Google sign-in isn’t set up on this server yet.',
};

export default function Login() {
  const [params] = useSearchParams();
  const googleError = params.get('error');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(googleError ? GOOGLE_ERRORS[googleError] || 'Google sign-in failed. Please try again.' : '');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate(location.state?.from || '/chat', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue to your assistant."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      <GoogleSignInButton />
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Email" id="email" type="email" autoComplete="email" required value={form.email} onChange={onChange} />
        <FormField label="Password" id="password" type="password" autoComplete="current-password" required value={form.password} onChange={onChange} />
        <SubmitButton loading={loading}>Log in</SubmitButton>
      </form>
    </AuthLayout>
  );
}
