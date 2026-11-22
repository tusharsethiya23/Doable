// Small pill showing a tool the agent used, with a live status: running (spinner), success (✓), failed (✕), stopped.
import Spinner from '../Spinner';
import { toolLabel } from '../../lib/toolLabels';

const styles = {
  running: 'border-brand-500/40 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-50',
  success: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  failed: 'border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  stopped: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const icons = { success: '✓', failed: '✕', stopped: '■' };

export default function ToolChip({ name, status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status] || styles.success}`}>
      {status === 'running' ? <Spinner className="size-3" /> : <span aria-hidden="true">{icons[status]}</span>}
      {toolLabel(name, status)}
      {status === 'running' && '…'}
      {status === 'failed' && <span className="sr-only">(failed)</span>}
    </span>
  );
}
