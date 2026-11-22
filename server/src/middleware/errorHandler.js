// Catches unknown routes (404) and turns every thrown error into a consistent JSON response.
import { ApiError } from '../utils/ApiError.js';
import { isProd } from '../config/env.js';
import { logError } from '../utils/logger.js';

export function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- Express needs all 4 args to detect an error handler
export function errorHandler(err, _req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  // Translate common Mongoose errors into friendly messages
  if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue || {}).join(', ') || 'Value'} already exists`;
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid id';
  } else if (err.name === 'ValidationError') {
    status = 400;
  }

  if (status >= 500) logError('Unhandled request error', err);

  res.status(status).json({
    success: false,
    message: status >= 500 && isProd ? 'Internal server error' : message, // hide internals in prod
    ...(err.details && { details: err.details }),
  });
}
