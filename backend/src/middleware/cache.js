const NodeCache = require('node-cache');

// Create a new cache instance with a standard TTL of 60 seconds.
// checkperiod: period in seconds for the automatic delete check interval.
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

/**
 * Build the cache key for a request.
 *
 * SECURITY (tenancy): the key MUST include the caller's authorization scope,
 * not just the URL.
 *
 * Several cached routes are state-scoped — /api/events and
 * /api/events/stats/summary both apply `.eq('state_id', req.userStateId)` for
 * coordinators. Keying on the URL alone meant a Maharashtra coordinator's
 * response was stored under `__express__/api/events` and then served verbatim
 * to a Kerala coordinator hitting the identical URL: a silent cross-tenant
 * data leak with no error and no audit trail.
 *
 * The scope segment is derived from server-resolved values only
 * (req.userRole / req.userStateId, set by stateScope after verifying the JWT)
 * — never from client-supplied headers, so it cannot be spoofed to poison or
 * read another tenant's cache entry.
 *
 * Anonymous and admin callers share the `anon` / `admin:<id>` scopes
 * respectively, which is correct: neither response is state-filtered.
 */
function buildCacheKey(req) {
  const role = req.userRole || 'anon';

  let scope;
  if (role === 'coordinator') {
    // Coordinators see only their own state — partition strictly by state.
    scope = `coordinator:${req.userStateId || 'unassigned'}`;
  } else if (role === 'admin') {
    // Admins are unscoped (nationwide), so all admins can share one entry.
    scope = 'admin';
  } else {
    // citizen / responder / anonymous — unscoped public view.
    scope = role;
  }

  return `__express__${scope}__${req.originalUrl || req.url}`;
}

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

    const key = buildCacheKey(req);
    const cachedBody = cache.get(key);

    if (cachedBody) {
      // Serve from cache
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedBody);
    }

    // Hijack res.json to intercept the response body and cache it
    res.setHeader('X-Cache', 'MISS');
    const originalSend = res.json.bind(res);

    res.json = (body) => {
      // Only cache successful responses. Previously ANY body was cached —
      // so a transient 500 from an upstream outage was stored and replayed
      // to every caller for the full TTL, turning a blip into an outage.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, body, duration);
      }
      return originalSend(body);
    };

    next();
  };
};

/**
 * Drop every cached entry whose key contains `substring`.
 * Useful after a write that invalidates a cached read across all tenants,
 * e.g. flushCache('/api/events') after an ingestion batch.
 */
function flushCache(substring) {
  const doomed = cache.keys().filter((k) => k.includes(substring));
  if (doomed.length) cache.del(doomed);
  return doomed.length;
}

module.exports = {
  cache,
  cacheMiddleware,
  buildCacheKey,
  flushCache,
};
