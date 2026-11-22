// Safe error logging. Never print whole error objects: Google/HTTP client errors contain the request config,
// including "Authorization: Bearer <token>" headers. We log only the name, status, message and a short stack (SRS NFR-12).
import { isProd } from '../config/env.js';

export function logError(context, err) {
  const status = err?.status ?? err?.response?.status;
  console.error(`❌ ${context}: ${err?.name || 'Error'}${status ? ` (${status})` : ''}: ${err?.message ?? err}`);
  if (!isProd && err?.stack) console.error(err.stack.split('\n').slice(1, 5).join('\n'));
}
