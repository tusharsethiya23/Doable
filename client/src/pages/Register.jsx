// Register page: sign up with Google, or create an account with email + password and log straight in.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import FormField from '../components/FormField';
import SubmitButton from '../components/SubmitButton';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { register } from '../services/authService';
import { getErrorMessage } from '../lib/api';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/chat', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Your assistant for email, meetings and reminders."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <GoogleSignInButton />
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}
        <FormField label="Name" id="name" autoComplete="name" required minLength={2} value={form.name} onChange={onChange} />
        <FormField label="Email" id="email" type="email" autoComplete="email" required value={form.email} onChange={onChange} />
        <FormField
          label="Password"
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          value={form.password}
          onChange={onChange}
        />
        <SubmitButton loading={loading}>Create account</SubmitButton>
      </form>
    </AuthLayout>
  );
}
