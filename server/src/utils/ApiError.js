// Custom error classes.
// ApiError: has an HTTP status code; throw it anywhere and the error middleware sends it to the client.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details; // optional extra info, e.g. per-field validation errors
  }
}

// IntegrationError: a tool needs an external account that isn't usable (not connected, expired, missing permission).
// The agent passes the message to the AI and the UI shows a "Connect" button.
const INTEGRATION_MESSAGES = {
  not_connected: "The user hasn't connected their Google account yet. Tell them to connect it using the Connect Google button shown in the chat (or in Settings).",
  expired: 'The Google connection has expired or was revoked. Ask the user to reconnect Google using the button shown in the chat.',
  missing_scopes: "The user didn't grant the Google permission this needs. Ask them to reconnect Google and allow all requested access.",
};

export class IntegrationError extends Error {
  constructor(provider, reason) {
    super(INTEGRATION_MESSAGES[reason] || 'The integration is not available.');
    this.provider = provider;
    this.reason = reason;
  }
}
