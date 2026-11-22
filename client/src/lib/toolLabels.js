// Human-friendly names for tools, used in chat chips ("Checking the time…") and the Activity page.
const TOOL_LABELS = {
  get_current_time: { running: 'Checking the time', done: 'Checked the time' },
  web_search: { running: 'Searching the web', done: 'Searched the web' },
};

export function toolLabel(name, status = 'success') {
  const labels = TOOL_LABELS[name];
  if (!labels) return status === 'running' ? `Using ${name}` : `Used ${name}`;
  return status === 'running' ? labels.running : labels.done;
}
