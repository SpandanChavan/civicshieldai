const { v4: uuidv4 } = require('uuid');

/**
 * Centralized error handler — must be registered LAST in app.js
 * Catches all errors passed via next(err) and returns structured JSON.
 */
module.exports = function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || uuidv4();
  const status    = err.status || err.statusCode || 500;
  const isDev     = process.env.NODE_ENV !== 'production';

  // Log full details server-side
  console.error(`[ERROR] ${req.method} ${req.path} → ${status}`, {
    requestId,
    message: err.message,
    ...(isDev && { stack: err.stack }),
  });

  // Return clean JSON to client — never leak stack traces in prod
  res.status(status).json({
    error: true,
    requestId,
    message: err.message || 'An unexpected error occurred.',
    ...(isDev && { stack: err.stack }),
  });
};
