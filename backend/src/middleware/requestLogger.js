const { v4: uuidv4 } = require('uuid');

/**
 * HTTP request logger middleware.
 * Attaches a requestId to every request and logs:
 *   METHOD /path → STATUS  XXXms  [requestId]
 */
module.exports = function requestLogger(req, res, next) {
  const start     = Date.now();
  const requestId = uuidv4().slice(0, 8); // short 8-char id
  req.requestId   = requestId;

  res.on('finish', () => {
    const ms     = Date.now() - start;
    const status = res.statusCode;
    const color  = status >= 500 ? '❌' : status >= 400 ? '⚠️' : status >= 300 ? '↩️' : '✅';

    console.log(
      `${color} ${req.method.padEnd(6)} ${req.path.padEnd(40)} → ${status}  ${ms}ms  [${requestId}]`
    );
  });

  next();
};
