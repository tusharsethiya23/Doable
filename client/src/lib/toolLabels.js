// Human-friendly names for tools, used in chat chips ("Checking the time…") and the Activity page.
const TOOL_LABELS = {
  get_current_time: { running: 'Checking the time', done: 'Checked the time' },
  web_search: { running: 'Searching the web', done: 'Searched the web' },
  search_emails: { running: 'Searching your email', done: 'Searched your email' },
  read_email: { running: 'Reading an email', done: 'Read an email' },
  create_draft: { running: 'Saving a draft', done: 'Saved a draft in Gmail' },
  send_email: { running: 'Sending email', done: 'Sent email' },
};

export function toolLabel(name, status = 'success') {
  const labels = TOOL_LABELS[name];
  if (!labels) return status === 'running' ? `Using ${name}` : `Used ${name}`;
  return status === 'running' ? labels.running : labels.done;
}
