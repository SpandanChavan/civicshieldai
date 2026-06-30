const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');
const { cacheMiddleware } = require('../middleware/cache');
const router = express.Router();

function getDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/**
 * Parse PostGIS EWKB hex string into { lat, lon }.
 * PostGIS geography columns are returned as EWKB binary (not WKT) by the REST API.
 * EWKB layout: 1B byte-order + 4B type + 4B SRID + 8B lon + 8B lat = 21 bytes = 50 hex chars
 */
function parseWkbPoint(hex) {
  if (!hex || typeof hex !== 'string' || hex.length < 42) return null;
  try {
    const isLE = hex.slice(0, 2) === '01';
    // EWKB (with SRID) has 18 hex chars of header; plain WKB has 10
    const hasSrid = hex.length >= 50;
    const offset = hasSrid ? 18 : 10;
    const lonBuf = Buffer.from(hex.slice(offset, offset + 16), 'hex');
    const latBuf = Buffer.from(hex.slice(offset + 16, offset + 32), 'hex');
    const lon = isLE ? lonBuf.readDoubleLE(0) : lonBuf.readDoubleBE(0);
    const lat = isLE ? latBuf.readDoubleLE(0) : latBuf.readDoubleBE(0);
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  } catch { return null; }
}

/** Attach lat/lon to each event object for frontend map rendering. */
function withCoords(events) {
  return events.map((e) => {
    const coords = typeof e.location === 'string' ? parseWkbPoint(e.location) : null;
    return coords ? { ...e, lat: coords.lat, lon: coords.lon } : e;
  });
}

// ── GET /api/events ───────────────────────────────────
// Query params: type, severity, limit, offset, active, mode=diverse
// Cache for 30 seconds since events update frequently but are queried heavily
router.get('/', cacheMiddleware(30), async (req, res) => {
  try {
    const { type, severity, limit = 100, offset = 0, active = 'true', mode } = req.query;
    const db = getDb();

    // ── Diverse mode: top N per event_type in parallel ──
    if (mode === 'diverse') {
      const PER_TYPE = 60;
      const EVENT_TYPES = [
        'Earthquake', 'Wildfire', 'Flood', 'Cyclone',
        'Tsunami', 'Volcano', 'Landslide', 'Drought',
        'Heatwave', 'Cold Wave', 'Natural Event', // 🇮🇳 India-specific
      ];

      const queries = EVENT_TYPES.map((et) => {
        let q = db.from('events').select('*').eq('event_type', et);
        if (active !== 'all') q = q.eq('is_active', active === 'true');
        if (req.userRole === 'coordinator' && req.userStateId) {
          q = q.eq('state_id', req.userStateId);
        }
        return q.order('detected_at', { ascending: false }).limit(PER_TYPE);
      });

      const results = await Promise.all(queries);
      const merged = results.flatMap((r) => r.data || []);
      merged.sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
      return res.json({ data: withCoords(merged), count: merged.length });
    }

    // ── Standard paginated query ─────────────────────────
    let query = db
      .from('events')
      .select('*')
      .order('detected_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (active !== 'all') query = query.eq('is_active', active === 'true');
    if (type) query = query.eq('event_type', type);
    if (severity) query = query.eq('severity', severity);
    if (req.userRole === 'coordinator' && req.userStateId) {
      query = query.eq('state_id', req.userStateId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data: withCoords(data), count: data.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── GET /api/events/stats/summary ────────────────────
// Cache summary stats for 60 seconds to reduce DB aggregation load
// NOTE: This MUST be declared before /:id to prevent Express matching 'stats/summary' as an :id param
router.get('/stats/summary', cacheMiddleware(60), async (req, res) => {
  try {
    const db = getDb();
    let query = db.from('events').select('event_type, severity').eq('is_active', true);
    if (req.userRole === 'coordinator' && req.userStateId) {
      query = query.eq('state_id', req.userStateId);
    }
    const { data, error } = await query;
    if (error) throw error;

    const summary = data.reduce((acc, e) => {
      acc.byType[e.event_type] = (acc.byType[e.event_type] || 0) + 1;
      acc.bySeverity[e.severity] = (acc.bySeverity[e.severity] || 0) + 1;
      return acc;
    }, { byType: {}, bySeverity: {}, total: data.length });

    res.json({ data: summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/events/:id ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await getDb()
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Event not found' });
    const coords = parseWkbPoint(data.location);
    res.json({ data: coords ? { ...data, ...coords } : data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/events/:id/deactivate ─────────────────
const DeactivateSchema = z.object({}).strict();

router.patch('/:id/deactivate', async (req, res) => {
  const parsed = DeactivateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });

  if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
  if (req.userRole !== 'coordinator' && req.userRole !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { data, error } = await getDb()
      .from('events')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/events/ingestion-health (B1) ────────────
// Returns the in-memory ingestion health snapshot per data source.
// Accessible to coordinator and admin roles (not public — requires auth).
router.get('/ingestion-health', (req, res) => {
  if (!req.userRole || !['coordinator', 'admin'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Coordinator or admin role required' });
  }
  try {
    const { getIngestionHealth } = require('../cron/apiPollers');
    res.json({ data: getIngestionHealth(), timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
