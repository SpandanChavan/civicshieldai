const rateLimit = require('express-rate-limit');

/**
 * Strict rate limiter for write endpoints (POST/PUT/DELETE).
 * 30 requests per 15 minutes per IP.
 */
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please wait before submitting again.' },
});

/**
 * Standard rate limiter for read endpoints.
 * 200 requests per 15 minutes per IP.
 */
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

/**
 * Lenient limiter for public-facing endpoints like the portal.
 * 500 requests per 15 minutes.
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { strictLimiter, standardLimiter, publicLimiter };
