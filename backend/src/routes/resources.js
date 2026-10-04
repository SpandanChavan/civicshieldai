const express = require('express');
const { z } = require('zod');
const { logAudit } = require('../utils/auditLogger');
const { getAdminDb: getDb } = require('../lib/db');
const router = express.Router();

const ResourceSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(['ambulance', 'fire_truck', 'helicopter', 'shelter', 'food', 'water', 'medical', 'rescue_team', 'other']),
  status: z.enum(['available', 'deployed', 'maintenance', 'unavailable']).default('available'),
  quantity: z.number().int().min(0).default(1),
  location: z.object({ lat: z.number(), lon: z.number() }).optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  assigned_event: z.string().uuid().optional(),
});

// ── GET /api/resources ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, status, limit = 200 } = req.query;
    let query = getDb().from('resources').select('*').limit(Number(limit));
    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);
    if (req.userRole === 'coordinator' && req.userStateId) {
      query = query.eq('state_id', req.userStateId);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/resources ───────────────────────────────
router.post('/', async (req, res) => {
  const parsed = ResourceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }
  if (req.userRole === 'coordinator' && req.userStateId) {
    req.body.state_id = req.userStateId;
  } else if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'State assignment required to manage resources' });
  }

  const { location, ...rest } = parsed.data;
  try {
    const { data, error } = await getDb()
      .from('resources')
      .insert({
        ...rest,
        state_id: req.body.state_id,
        ...(location && {
          location: `SRID=4326;POINT(${location.lon} ${location.lat})`,
        }),
      })
      .select()
      .single();
    if (error) throw error;

    logAudit('RESOURCE_CREATED', req.userId, data.id, { 
      type: data.type, 
      assigned_event: data.assigned_event 
    });

    res.status(201).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/resources/:id ──────────────────────────
// Partial update — validate the subset of fields provided (no blind req.body spread)
const ResourceUpdateSchema = ResourceSchema.partial().extend({
  assigned_event: z.string().uuid().nullable().optional(),
}).strict();

router.patch('/:id', async (req, res) => {
  // SECURITY: PATCH previously had no auth check at all — any caller could
  // reassign or relocate any resource in any state. Now gated on role AND
  // scoped to the coordinator's own state (admins are unrestricted).
  if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
  if (req.userRole !== 'coordinator' && req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Coordinators and admins only' });
  }

  const parsed = ResourceUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }

  // Convert a {lat,lon} location (if supplied) to PostGIS WKT
  const { location, ...rest } = parsed.data;
  const updates = {
    ...rest,
    ...(location && { location: `SRID=4326;POINT(${location.lon} ${location.lat})` }),
    updated_at: new Date().toISOString(),
  };

  try {
    // Tenancy: a coordinator may only touch rows inside their own state.
    // Applying .eq('state_id', ...) to the UPDATE itself makes the check
    // atomic — no separate SELECT, no TOCTOU window, one round-trip.
    let query = getDb().from('resources').update(updates).eq('id', req.params.id);
    if (req.userRole === 'coordinator') {
      if (!req.userStateId) {
        return res.status(403).json({ error: 'State assignment required to manage resources' });
      }
      query = query.eq('state_id', req.userStateId);
    }

    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Resource not found in your jurisdiction' });
    }

    if (parsed.data.assigned_event) {
      logAudit('RESOURCE_ASSIGNED', req.userId, data.id, { assigned_event: parsed.data.assigned_event });
    }

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/resources/:id ─────────────────────────
const DeleteResourceSchema = z.object({}).strict();

router.delete('/:id', async (req, res) => {
  const parsed = DeleteResourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });

  if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
  if (req.userRole !== 'coordinator' && req.userRole !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    // Same tenancy rule as PATCH: coordinators delete only within their state.
    let query = getDb().from('resources').delete().eq('id', req.params.id);
    if (req.userRole === 'coordinator') {
      if (!req.userStateId) {
        return res.status(403).json({ error: 'State assignment required to manage resources' });
      }
      query = query.eq('state_id', req.userStateId);
    }
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Resource not found in your jurisdiction' });
    }
    logAudit('RESOURCE_DELETED', req.userId, req.params.id, {});
    res.json({ message: 'Resource deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
