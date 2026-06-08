const { createClient } = require('@supabase/supabase-js');

/**
 * Auth middleware — verifies Supabase JWT from Authorization header.
 * Attach to routes that require authentication.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Soft auth — attaches user if token present but doesn't block unauthenticated requests.
 */
async function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
      const { data: { user } } = await supabase.auth.getUser(token);
      req.user = user;
    } catch (_) { /* ignore */ }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
