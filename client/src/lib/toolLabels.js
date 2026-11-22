// Human-friendly names for tools, used in chat chips ("Checking the time…") and the Activity page.
const TOOL_LABELS = {
  get_current_time: { running: 'Checking the time', done: 'Checked the time' },
  web_search: { running: 'Searching the web', done: 'Searched the web' },
  search_emails: { running: 'Searching your email', done: 'Searched your email' },
  read_email: { running: 'Reading an email', done: 'Read an email' },
  create_draft: { running: 'Saving a draft', done: 'Saved a draft in Gmail', action: 'Save draft' },
  send_email: { running: 'Sending email', done: 'Sent email', action: 'Send email' },
  list_events: { running: 'Checking your calendar', done: 'Checked your calendar' },
  check_availability: { running: 'Finding free time', done: 'Found free time' },
  create_event: { running: 'Creating event', done: 'Created event', action: 'Create event' },
  update_event: { running: 'Updating event', done: 'Updated event', action: 'Update event' },
  delete_event: { running: 'Cancelling event', done: 'Cancelled event', action: 'Cancel event' },
};

// Wording for actions that didn't run
const NOT_DONE = { pending: 'waiting for your approval', rejected: 'rejected', expired: 'not approved' };

export function toolLabel(name, status = 'success') {
  const labels = TOOL_LABELS[name];
  if (NOT_DONE[status]) return `${labels?.action ?? name} — ${NOT_DONE[status]}`;
  if (!labels) return status === 'running' ? `Using ${name}` : `Used ${name}`;
  return status === 'running' ? labels.running : labels.done;
}
