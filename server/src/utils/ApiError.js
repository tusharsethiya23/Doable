// Error with an HTTP status code; throw it anywhere and the error middleware sends it to the client.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details; // optional extra info, e.g. per-field validation errors
  }
}
