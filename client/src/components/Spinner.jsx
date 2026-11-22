// Small spinning loader used on buttons and full-page loading screens.
export default function Spinner({ className = 'size-5' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
