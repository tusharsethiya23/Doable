// 404 page for unknown URLs.
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-5xl font-bold text-brand-600">404</p>
        <h1 className="mt-3 text-xl font-semibold">Page not found</h1>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
