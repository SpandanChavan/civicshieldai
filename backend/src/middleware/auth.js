/**
 * backend/src/middleware/auth.js
 *
 * HARD auth gates. These *reject* unauthenticated or under-privileged
 * requests, unlike `stateScope` (middleware/stateScope.js) which is a soft
 * middleware that always calls next() and merely annotates the request.
 *
 * Normal flow: app.js mounts stateScope globally on /api, so every handler
 * already has req.userId / req.userRole / req.userStateId. Use these gates
 * when you want the rejection expressed as middleware instead of an inline
 * `if (!req.userId) return res.status(401)` at the top of a handler.
 *
 * History / why this file was rewritten:
 *   1. `requireAuth` contained a hardcoded backdoor — `Bearer TEST_TOKEN`
 *      granted the coordinator role with no environment guard. Removed.
 *   2. `optionalAuth` referenced an undeclared `authHeader`, so it threw a
 *      ReferenceError on every single call. Fixed.
 *   3. Both created a new Supabase client per request. Now they reuse the
 *      singletons from lib/db.js (the same `m5` fix applied elsewhere).
 */
const { getAnonDb, getAdminDb } = require('../lib/db');

/**
 * Extract a Bearer token from the Authorization header.
 * @returns {string|null} the token, or null when absent/malformed
 */
function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Hard gate — 401s unless a valid Supabase JWT is present.
 *
 * Reuses req.userId when stateScope already resolved it, so the common path
 * costs zero extra network calls.
 */
async function requireAuth(req, res, next) {
  // stateScope already verified this request — trust it and skip the round-trip.
  if (req.userId) return next();

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const { data: { user }, error } = await getAnonDb().auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user   = user;
    req.userId = user.id;

    // Populate role/state so downstream handlers behave identically whether
    // they were reached via stateScope or via this gate.
    if (!req.userRole) {
      const { data: profile } = await getAdminDb()
        .from('user_profiles')
        .select('state_id, role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) {
        req.userRole    = profile.role     || 'citizen';
        req.userStateId = profile.state_id || null;
      }
    }

    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Role gate — use *after* requireAuth (or after global stateScope).
 * Usage: router.post('/', requireRole('coordinator', 'admin'), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        error: `Forbidden: requires one of [${allowedRoles.join(', ')}]`,
      });
    }
    next();
  };
}

/**
 * Soft auth — attaches req.user when a valid token is present, but never
 * blocks. Prefer the globally-mounted stateScope; this exists for routers
 * mounted outside /api.
 */
async function optionalAuth(req, _res, next) {
  const token = getBearerToken(req);
  if (!token) return next();

  try {
    const { data: { user } } = await getAnonDb().auth.getUser(token);
    if (user) {
      req.user   = user;
      req.userId = user.id;
    }
  } catch (_) {
    /* ignore — soft auth never blocks */
  }
  next();
}

module.exports = { requireAuth, requireRole, optionalAuth, getBearerToken };
