/**
 * backend/src/routes/sos.js
 *
 * SOS Emergency Routes
 *
 * POST   /api/sos                     — Create SOS (authenticated citizen)
 * GET    /api/sos                     — List SOS requests (coordinator/admin/responder)
 * GET    /api/sos/mine                — Citizen views their own SOS history
 * GET    /api/sos/nearest-safe-zones  — Nearest available resources for a lat/lon
 * GET    /api/sos/:id                 — Get a single SOS request
 * PATCH  /api/sos/:id/acknowledge     — Coordinator acknowledges SOS
 * PATCH  /api/sos/:id/resolve         — Mark SOS as resolved
 * PATCH  /api/sos/:id/cancel          — Citizen cancels their own active SOS
 */

const express = require('express');
const { z } = require('zod');
const { getAdminDb } = require('../lib/db');
const { logAudit } = require('../utils/auditLogger');
const notificationRouter = require('../services/notificationRouter');

const router = express.Router();

// ─── Zod validation schemas ───────────────────────────────────────────────────

const createSosSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  message:   z.string().max(500).optional().nullable(),
  event_id:  z.string().uuid().optional().nullable(),
});

const acknowledgeSchema = z.object({
  eta_minutes: z.number().int().min(1).max(300).optional(),
  note:        z.string().max(500).optional(),
});

// ─── Helper: validate request body with Zod ──────────────────────────────────

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

// ─── POST /api/sos ────────────────────────────────────────────────────────────
// Creates an SOS request. Requires authentication (any role).
// Emits Socket.io event to state room and sends SMS to emergency contacts.

router.post('/', validate(createSosSchema), async (req, res, next) => {
  try {
    // Must be logged in
    if (!req.userId) {
      return res.status(401).json({ error: 'You must be logged in to send an SOS.' });
    }

    const { latitude, longitude, message, event_id } = req.body;
    const db = getAdminDb();

    // ── 1. Check for already-active SOS from this user ──────────────────────
    const { data: existingSos } = await db
      .from('sos_requests')
      .select('id')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSos) {
      return res.status(409).json({
        error: 'You already have an active SOS request. Cancel it before creating a new one.',
        existing_id: existingSos.id,
      });
    }

    // ── 2. Resolve state_id from coordinates ─────────────────────────────────
    // Uses the existing get_state_from_point RPC (defined in migration 006).
    const { data: stateId, error: rpcError } = await db.rpc('get_state_from_point', {
      lat: latitude,
      lon: longitude,
    });

    if (rpcError) {
      console.error('[SOS] get_state_from_point RPC error:', rpcError.message);
      // Do NOT abort — state_id being null is acceptable; SOS still goes through.
    }

    // ── 3. Build PostGIS WKT point string ────────────────────────────────────
    // Format: SRID=4326;POINT(longitude latitude) — note lon first, then lat.
    const locationWkt = `SRID=4326;POINT(${longitude} ${latitude})`;

    // ── 4. Insert SOS request ────────────────────────────────────────────────
    const { data: sos, error: insertError } = await db
      .from('sos_requests')
      .insert({
        user_id:     req.userId,
        latitude,
        longitude,
        location:    locationWkt,
        message:     message || null,
        event_id:    event_id || null,
        state_id:    stateId || null,
        status:      'active',
        device_info: {
          user_agent: req.headers['user-agent'] || null,
          created_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // ── 5. Audit log ─────────────────────────────────────────────────────────
    await logAudit('SOS_CREATED', req.userId, sos.id, {
      latitude,
      longitude,
      state_id: stateId,
    });

    // ── 6. Fetch user profile for name and emergency contacts ─────────────────
    const { data: profile } = await db
      .from('user_profiles')
      .select('full_name, emergency_contacts')
      .eq('id', req.userId)
      .maybeSingle();

    // ── 7. Fetch user email from Supabase Auth ────────────────────────────────
    let userEmail = null;
    try {
      const { data: authData } = await db.auth.admin.getUserById(req.userId);
      userEmail = authData?.user?.email || null;
    } catch (authErr) {
      console.error('[SOS] Could not fetch user email:', authErr.message);
    }

    // ── 8. Emit Socket.io events to coordinator and admin rooms ──────────────
    // Correction 3: Use req.app.get('io') instead of req.io
    const io = req.app.get('io');
    const sosPayload = {
      id:         sos.id,
      user_id:    req.userId,
      full_name:  profile?.full_name || userEmail || 'Unknown',
      latitude,
      longitude,
      message:    message || null,
      state_id:   stateId || null,
      created_at: sos.created_at,
    };

    if (io) {
      if (stateId) {
        io.to(`state:${stateId}`).emit('sos:new', sosPayload);
      } else {
        io.to('role:coordinator').emit('sos:new', sosPayload);
      }
      io.to('role:admin').emit('sos:new', sosPayload);
      io.to('role:responder').emit('sos:new', sosPayload);
    } else {
      console.warn('[SOS] io not available — Socket.io event not emitted');
    }

    // ── 9. Send SMS to emergency contacts ────────────────────────────────────
    const emergencyContacts = Array.isArray(profile?.emergency_contacts)
      ? profile.emergency_contacts
      : [];

    if (emergencyContacts.length > 0) {
      const mapsLink  = `https://maps.google.com/?q=${latitude},${longitude}`;
      const senderName = profile?.full_name || userEmail || 'Someone';
      const smsBody   = [
        `🚨 EMERGENCY SOS from ${senderName}`,
        `They need immediate help at:`,
        mapsLink,
        message ? `Their message: "${message}"` : '',
        `Alert sent via CivicShield AI — India Disaster Response Platform`,
      ].filter(Boolean).join('\n');

      // Correction 2: Passed correct object structure for SMS routing
      try {
        await notificationRouter.routeAlert(
          { title: `SOS from ${senderName}`, body: smsBody, severity: 'Critical' },
          ['sms'],
          { smsNumbers: emergencyContacts.map(c => c.phone).filter(Boolean) }
        );
      } catch (smsErr) {
        // Log but do not fail the whole SOS creation
        console.error(`[SOS] SMS failed:`, smsErr.message);
      }
    }

    // ── 10. Fetch nearest safe zones to return in the response ───────────────
    const { data: nearestZones, error: zonesError } = await db.rpc('get_nearest_safe_zones', {
      p_latitude:  latitude,
      p_longitude: longitude,
      p_limit:     5,
    });

    if (zonesError) {
      console.error('[SOS] get_nearest_safe_zones error:', zonesError.message);
    }

    // ── 11. Respond ──────────────────────────────────────────────────────────
    return res.status(201).json({
      success:           true,
      sos,
      nearest_safe_zones: nearestZones || [],
    });

  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos ─────────────────────────────────────────────────────────────
// Lists SOS requests. Coordinators see their state only; admins see all.
// Query params: status (active|acknowledged|resolved|cancelled|all), limit, offset

router.get('/', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowedRoles = ['coordinator', 'admin', 'responder'];
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const db     = getAdminDb();
    const status = req.query.status || 'active';
    const limit  = Math.min(parseInt(req.query.limit || '50'), 100);
    const offset = parseInt(req.query.offset || '0');

    let query = db
      .from('sos_requests')
      .select(`
        id, user_id, latitude, longitude, message, status, state_id,
        acknowledged_by, acknowledged_at, resolved_at, cancelled_at, created_at,
        user_profiles ( full_name ),
        states ( name, code )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Scope coordinators to their own state
    if (req.userRole === 'coordinator' && req.userStateId) {
      query = query.eq('state_id', req.userStateId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ sos_requests: data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos/mine ────────────────────────────────────────────────────────
// Citizen fetches their own SOS history (for status banner + history page).
// IMPORTANT: This route must be declared BEFORE /:id to avoid "mine" being
// interpreted as a UUID parameter.

router.get('/mine', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getAdminDb();
    const { data, error } = await db
      .from('sos_requests')
      .select('id, status, latitude, longitude, message, state_id, created_at, acknowledged_at, resolved_at, states(name)')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return res.json({ sos_requests: data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos/nearest-safe-zones ─────────────────────────────────────────
// Returns nearest available resources for a given lat/lon.
// Public endpoint (no auth required) so it works even before SOS submission.
// Query params: lat, lon, limit (default 5)

router.get('/nearest-safe-zones', async (req, res, next) => {
  try {
    const { lat, lon, limit } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Both lat and lon query parameters are required.' });
    }

    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'lat and lon must be valid decimal numbers.' });
    }
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({ error: 'lat must be between -90 and 90.' });
    }
    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'lon must be between -180 and 180.' });
    }

    const db = getAdminDb();
    const { data, error } = await db.rpc('get_nearest_safe_zones', {
      p_latitude:  latitude,
      p_longitude: longitude,
      p_limit:     Math.min(parseInt(limit || '5'), 20),
    });

    if (error) throw error;

    return res.json({ safe_zones: data || [] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos/:id ─────────────────────────────────────────────────────────
// Fetches a single SOS request. Access: owner, coordinator of that state, admin, responder.

router.get('/:id', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getAdminDb();
    const { data, error } = await db
      .from('sos_requests')
      .select(`
        *,
        user_profiles ( full_name ),
        states ( name, code )
      `)
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'SOS request not found.' });

    const isOwner      = data.user_id === req.userId;
    const isCoordinator = req.userRole === 'coordinator' && data.state_id === req.userStateId;
    const isAdmin      = req.userRole === 'admin';
    const isResponder  = req.userRole === 'responder';

    if (!isOwner && !isCoordinator && !isAdmin && !isResponder) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return res.json({ sos: data });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sos/:id/acknowledge ──────────────────────────────────────────
// Coordinator/admin/responder acknowledges an active SOS.
// Notifies the citizen via Socket.io.

router.patch('/:id/acknowledge', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowed = ['coordinator', 'admin', 'responder'];
    if (!allowed.includes(req.userRole)) {
      return res.status(403).json({ error: 'Only coordinators, admins, or responders can acknowledge SOS.' });
    }

    // Validate body (optional fields)
    const parsed = acknowledgeSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten().fieldErrors });
    }

    const { eta_minutes, note } = parsed.data;
    const db = getAdminDb();

    // Fetch current SOS to check status and get citizen's user_id
    const { data: existing, error: fetchErr } = await db
      .from('sos_requests')
      .select('id, status, user_id, state_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'SOS request not found.' });
    if (existing.status !== 'active') {
      return res.status(400).json({
        error: `Cannot acknowledge SOS with status "${existing.status}". Only active SOS can be acknowledged.`,
      });
    }

    // Update the SOS
    const { data: updated, error: updateErr } = await db
      .from('sos_requests')
      .update({
        status:          'acknowledged',
        acknowledged_by: req.userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    await logAudit('SOS_ACKNOWLEDGED', req.userId, req.params.id, { eta_minutes, note });

    // Notify the citizen via their personal Socket.io room (Correction 3: use req.app.get('io'))
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${existing.user_id}`).emit('sos:acknowledged', {
        id:              req.params.id,
        acknowledged_by: req.userId,
        eta_minutes:     eta_minutes || null,
        note:            note || null,
        acknowledged_at: updated.acknowledged_at,
      });
    }

    return res.json({ success: true, sos: updated });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sos/:id/resolve ──────────────────────────────────────────────
// Coordinator/admin/responder resolves an acknowledged SOS.
router.patch('/:id/resolve', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowed = ['coordinator', 'admin', 'responder'];
    if (!allowed.includes(req.userRole)) {
      return res.status(403).json({ error: 'Only coordinators, admins, or responders can resolve SOS.' });
    }

    const db = getAdminDb();
    
    const { data: existing, error: fetchErr } = await db
      .from('sos_requests')
      .select('id, status, user_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'SOS request not found.' });
    if (existing.status === 'resolved' || existing.status === 'cancelled') {
      return res.status(400).json({ error: `Cannot resolve SOS with status "${existing.status}".` });
    }

    const { data: updated, error: updateErr } = await db
      .from('sos_requests')
      .update({
        status:      'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateErr) throw updateErr;
    
    await logAudit('SOS_RESOLVED', req.userId, req.params.id);

    // Notify the citizen (Correction 3: use req.app.get('io'))
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${existing.user_id}`).emit('sos:resolved', {
        id:          req.params.id,
        resolved_at: updated.resolved_at,
      });
    }

    return res.json({ success: true, sos: updated });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sos/:id/cancel ───────────────────────────────────────────────
// Citizen cancels their own SOS.
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getAdminDb();
    
    const { data: existing, error: fetchErr } = await db
      .from('sos_requests')
      .select('id, user_id, status, state_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'SOS request not found.' });
    if (existing.user_id !== req.userId) {
      return res.status(403).json({ error: 'You can only cancel your own SOS request.' });
    }
    if (existing.status !== 'active') {
      return res.status(400).json({ error: `Cannot cancel SOS because it is already ${existing.status}.` });
    }

    const { data: updated, error: updateErr } = await db
      .from('sos_requests')
      .update({
        status:       'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Notify coordinators that it was cancelled (Correction 3: use req.app.get('io'))
    const io = req.app.get('io');
    if (io) {
      if (existing.state_id) {
        io.to(`state:${existing.state_id}`).emit('sos:cancelled', { id: req.params.id });
      }
      io.to('role:admin').emit('sos:cancelled', { id: req.params.id });
    }

    return res.json({ success: true, sos: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
