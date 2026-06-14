const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { logAudit } = require('../utils/auditLogger');
const router = express.Router();

function getDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

const IncidentSchema = z.object({
  description: z.string().min(10).max(2000),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  media_urls: z.array(z.string().url()).optional().default([]),
  event_id: z.string().uuid().optional(),
  reporter_id: z.string().uuid().optional(),
});

// ── GET /api/incidents ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    let query = getDb()
      .from('incident_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/incidents/:id ────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await getDb()
      .from('incident_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Incident not found' });
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/incidents ───────────────────────────────
const incidentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // max 5 incidents per IP
  message: { error: 'Too many incident reports created from this IP, please try again after 10 minutes.' }
});

router.post('/', incidentLimiter, async (req, res) => {
  const parsed = IncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }

  const { location, ...rest } = parsed.data;
  try {
    const { data, error } = await getDb()
      .from('incident_reports')
      .insert({
        ...rest,
        location: `SRID=4326;POINT(${location.lon} ${location.lat})`,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    
    // Log audit action asynchronously
    logAudit('INCIDENT_REPORTED', parsed.data.reporter_id || null, data.id, { 
      status: 'pending',
      lat: location.lat,
      lon: location.lon
    });

    res.status(201).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/incidents/:id/status ──────────────────
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const VALID = ['pending', 'verified', 'rejected', 'resolved'];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID.join(', ')}` });
  }
  try {
    const { data, error } = await getDb()
      .from('incident_reports')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
