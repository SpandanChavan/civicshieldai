const express = require('express');
const axios = require('axios');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { logAudit } = require('../utils/auditLogger');
const { getAdminDb: getDb } = require('../lib/db');
const router = express.Router();

const IncidentSchema = z.object({
  description: z.string().min(10).max(2000),
  category: z.string().optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  media_urls: z.array(z.string().url()).optional().default([]),
  event_id: z.string().uuid().optional(),
  reporter_name: z.string().optional(),
  reporter_contact: z.string().optional(),
});

// ── GET /api/incidents ────────────────────────────────
// Coordinators see their state's pending reports
// Citizens see only their own reports (filtered by reporter_id = userId)
// Admins see everything
router.get('/', async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    let query = getDb()
      .from('incident_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);

    if (req.userRole === 'coordinator' && req.userStateId) {
      // Coordinator sees all reports in their state
      query = query.eq('state_id', req.userStateId);
    } else if (req.userRole === 'citizen' && req.userId) {
      // Citizens see only their own reports
      query = query.eq('reporter_id', req.userId);
    }
    // admin: no additional filter — sees everything

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/incidents/pending ────────────────────────
// Coordinator-only: pending reports awaiting review in their state
router.get('/pending', async (req, res) => {
  if (req.userRole !== 'coordinator' || !req.userStateId) {
    return res.status(403).json({ error: 'Coordinators only' });
  }
  try {
    const { data, error } = await getDb()
      .from('incident_reports')
      .select('*')
      .eq('state_id', req.userStateId)
      .in('status', ['pending_review', 'under_review'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data, count: data.length });
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
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Too many incident reports. Please try again after 10 minutes.' }
});

router.post('/', incidentLimiter, async (req, res) => {
  const parsed = IncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }

  // Only authenticated citizens or coordinators can submit
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required to submit a report' });
  }

  const { location, ...rest } = parsed.data;
  let finalStateId = null;

  // Geocode location → state
  try {
    const { data: stateId } = await getDb().rpc('get_state_from_point', {
      lat: location.lat,
      lon: location.lon,
    });
    if (stateId) finalStateId = stateId;
  } catch (err) {
    console.error('[Incidents] Geocoding error:', err.message);
  }

  try {
    const { data, error } = await getDb()
      .from('incident_reports')
      .insert({
        ...rest,
        reporter_id: req.userId,
        state_id: finalStateId,
        location: `SRID=4326;POINT(${location.lon} ${location.lat})`,
        status: 'pending_review',
      })
      .select()
      .single();
    if (error) throw error;

    logAudit('INCIDENT_REPORTED', req.userId, data.id, {
      status: 'pending_review',
      lat: location.lat,
      lon: location.lon,
      state_id: finalStateId,
    });

    res.status(201).json({ data });

    if (finalStateId && req.app.get('io')) {
      req.app.get('io').to(`state:${finalStateId}`).emit('new_incident', data);
    }

    // ── E1: AI photo classification (best-effort, non-blocking) ──────────────
    // Response is already sent; this runs in the background and never affects
    // the citizen's submit. Stores the ML vision result on the report so the
    // coordinator review queue can show a suggested severity.
    const imageUrl = Array.isArray(data.media_urls) ? data.media_urls[0] : null;
    if (imageUrl) {
      (async () => {
        try {
          const ML = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
          const { data: cls } = await axios.post(
            `${ML}/classify/image`,
            { image_url: imageUrl },
            { timeout: 25000 }
          );
          if (cls && cls.available) {
            await getDb()
              .from('incident_reports')
              .update({ ai_classification: cls })
              .eq('id', data.id);
            // Notify the coordinator room so the queue updates live
            if (finalStateId && req.app.get('io')) {
              req.app.get('io').to(`state:${finalStateId}`).emit('incident_classified', {
                id: data.id,
                ai_classification: cls,
              });
            }
          }
        } catch (err) {
          console.warn('[Incidents] AI image classification skipped:', err.message);
        }
      })();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/incidents/:id/approve ─────────────────
// Coordinator approves a report. Optionally creates an official alert.
const ApproveSchema = z.object({
  event_type: z.string(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']).optional().default('Medium')
});

router.patch('/:id/approve', async (req, res) => {
  const parsed = ApproveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }

  if (req.userRole !== 'coordinator' && req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Coordinators only' });
  }

  try {
    const db = getDb();
    const { event_type, severity } = parsed.data;

    const { data: incident, error: fetchError } = await db
      .from('incident_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (fetchError || !incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    if (req.userRole === 'coordinator' && incident.state_id !== req.userStateId) {
      return res.status(403).json({ error: 'Forbidden: Incident belongs to another state' });
    }

    // Insert into events table
    let newLocation = incident.location;
    if (typeof incident.location === 'string') {
      const { parseWkbPoint } = require('../utils/geoHelpers');
      const parsed = parseWkbPoint(incident.location);
      if (parsed) {
        newLocation = `SRID=4326;POINT(${parsed.lon} ${parsed.lat})`;
      }
    }

    const { data: newEvent, error: eventError } = await db
      .from('events')
      .insert({
        title: incident.category ? incident.category.replace('_', ' ').toUpperCase() : 'INCIDENT',
        description: incident.description,
        event_type: event_type,
        location: newLocation,
        severity: severity,
        state_id: incident.state_id,
        source: 'citizen_report',
        is_active: true
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Update incident report
    const { data, error } = await db
      .from('incident_reports')
      .update({
        status: 'approved',
        reviewer_id: req.userId,
        reviewed_at: new Date().toISOString(),
        event_id: newEvent.id
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    logAudit('INCIDENT_APPROVED', req.userId, req.params.id, { state_id: req.userStateId });
    res.json({ data, message: 'Report approved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/incidents/:id/reject ──────────────────
const RejectSchema = z.object({
  reason: z.string().min(5, "A rejection reason of at least 5 characters is required"),
});

router.patch('/:id/reject', async (req, res) => {
  if (req.userRole !== 'coordinator' && req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Coordinators only' });
  }

  if (req.userRole === 'coordinator') {
    const { data: incident } = await getDb()
      .from('incident_reports')
      .select('state_id')
      .eq('id', req.params.id)
      .single();
    if (!incident || incident.state_id !== req.userStateId) {
      return res.status(403).json({ error: 'Forbidden: Incident belongs to another state' });
    }
  }
  const parsed = RejectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }
  const { reason } = parsed.data;
  try {
    const { data, error } = await getDb()
      .from('incident_reports')
      .update({
        status: 'rejected',
        reviewer_id: req.userId,
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    logAudit('INCIDENT_REJECTED', req.userId, req.params.id, { reason });
    res.json({ data, message: 'Report rejected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/incidents/:id/status (legacy) ──────────
// B8 FIX: require coordinator or admin role
const StatusSchema = z.object({
  status: z.enum(['pending_review', 'under_review', 'approved', 'rejected', 'resolved'], {
    errorMap: () => ({ message: "Invalid status. Must be one of: pending_review, under_review, approved, rejected, resolved" })
  }),
});

router.patch('/:id/status', async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.userRole !== 'coordinator' && req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Coordinators and admins only' });
  }

  if (req.userRole === 'coordinator') {
    const { data: incident } = await getDb()
      .from('incident_reports')
      .select('state_id')
      .eq('id', req.params.id)
      .single();
    if (!incident || incident.state_id !== req.userStateId) {
      return res.status(403).json({ error: 'Forbidden: Incident belongs to another state' });
    }
  }
  
  const parsed = StatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }
  const { status } = parsed.data;
  try {
    const { data, error } = await getDb()
      .from('incident_reports')
      .update({ status, reviewed_at: new Date().toISOString(), reviewer_id: req.userId })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    logAudit('INCIDENT_STATUS_CHANGED', req.userId, req.params.id, { status });
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
