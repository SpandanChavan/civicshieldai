const NodeCache = require('node-cache');
const { getAnonDb, getAdminDb } = require('../lib/db');

/**
 * m6 FIX: Cache user profiles for 60 seconds to avoid two DB
 * round-trips on every authenticated /api request.
 * Key: userId (string). Value: { role, state_id }.
 */
const profileCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

/**
 * stateScope middleware
 *
 * Reads the Bearer JWT, verifies it with the anon client, then
 * fetches (or serves from cache) the user_profiles row to attach
 * req.userId, req.userRole, req.userStateId to the request.
 *
 * Always calls next() — this is a soft-auth middleware, not a gate.
 */
const stateScope = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // unauthenticated request — continue
  }
  const token = authHeader.split(' ')[1];

  try {
    // 1. Verify JWT with the anon client (m5: singleton, no new client per request)
    const { data: { user }, error: authError } = await getAnonDb().auth.getUser(token);
    if (authError || !user) {
      return next();
    }

    req.userId = user.id;

    // 2. Check cache before hitting the DB (m6: 60-second TTL)
    const cached = profileCache.get(user.id);
    if (cached) {
      req.userRole    = cached.role      || 'citizen';
      req.userStateId = cached.state_id  || null;
      return next();
    }

    // 3. Cache miss — fetch profile via service-role client (m5: singleton)
    const { data: profile, error: profileError } = await getAdminDb()
      .from('user_profiles')
      .select('state_id, role')
      .eq('id', user.id)
      .single();

    if (!profileError && profile) {
      req.userRole    = profile.role      || 'citizen';
      req.userStateId = profile.state_id  || null;
      profileCache.set(user.id, { role: profile.role, state_id: profile.state_id });
    }
  } catch (error) {
    console.error('[Middleware] stateScope error:', error.message);
  }

  next();
};

module.exports = stateScope;
