const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');
const { logAudit } = require('../utils/auditLogger');
const router = express.Router();

function getDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

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

    logAudit('RESOURCE_CREATED', null, data.id, { 
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
    const { data, error } = await getDb()
      .from('resources')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    if (req.body.assigned_event) {
      logAudit('RESOURCE_ASSIGNED', null, data.id, { assigned_event: req.body.assigned_event });
    }

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/resources/:id ─────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await getDb().from('resources').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Resource deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
