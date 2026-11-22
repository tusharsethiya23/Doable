// Full-width primary button that shows a spinner and disables itself while loading.
import Spinner from './Spinner';

export default function SubmitButton({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
