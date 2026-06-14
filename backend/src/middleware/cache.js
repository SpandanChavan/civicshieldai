const NodeCache = require('node-cache');

// Create a new cache instance with a standard TTL of 60 seconds.
// checkperiod: period in seconds for the automatic delete check interval.
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

/**
 * Express middleware to cache responses in memory.
 * @param {number} duration - TTL for this specific route in seconds (defaults to 60)
 */
const cacheMiddleware = (duration = 60) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Construct a unique cache key based on the original URL (including query params)
    const key = `__express__${req.originalUrl || req.url}`;
    const cachedBody = cache.get(key);

    if (cachedBody) {
      // Serve from cache
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedBody);
    } else {
      // Hijack the res.json method to intercept the response body and cache it
      res.setHeader('X-Cache', 'MISS');
      const originalSend = res.json;
      
      res.json = (body) => {
        cache.set(key, body, duration);
        originalSend.call(res, body);
      };
      
      next();
    }
  };
};

module.exports = {
  cache,
  cacheMiddleware
};
