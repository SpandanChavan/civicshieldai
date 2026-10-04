const express = require('express');
const { z } = require('zod');
const { getAdminDb: getDb } = require('../lib/db');
const { cacheMiddleware } = require('../middleware/cache');
const router = express.Router();

// Middleware: Admin only
router.use((req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }
  next();
});

// ── GET /api/admin/coordinators ───────────────────────
router.get('/coordinators', async (req, res) => {
  try {
    const { data, error } = await getDb()
      .from('user_profiles')
      .select('id, full_name, role, state_id, states(name, code)')
      .eq('role', 'coordinator')
      .order('full_name');
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/admin/coordinators/:id ─────────────────
const CoordPatchSchema = z.object({ state_id: z.string().uuid() });

router.patch('/coordinators/:id', async (req, res) => {
  try {
    const parsed = CoordPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    const { state_id } = parsed.data;
    const { id } = req.params;
    const { data, error } = await getDb()
      .from('user_profiles')
      .update({ state_id, assigned_at: new Date().toISOString() })
      .eq('id', id)
      .eq('role', 'coordinator')
      .select('id, full_name, role, state_id, states(name, code)')
      .single();
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/stats ──────────────────────────────
// Nationwide aggregated stats for the admin dashboard
router.get('/stats', cacheMiddleware(30), async (req, res) => {
  try {
    const db = getDb();

    // PERF: this endpoint used to pull EVERY row of events, alerts and
    // incident_reports into Node just to call .length on them. On a populated
    // database that is tens of thousands of rows over the wire per dashboard
    // load, for four integers.
    //
    // Split into two kinds of query:
    //   • Pure totals  → head:true + count:'exact'. Postgres returns the count
    //     in the Content-Range header and streams ZERO rows.
    //   • Breakdowns   → still need per-row grouping keys, but select only the
    //     one or two columns actually used, never '*'.
    const [
      eventsCount, alertsCount, reportsCount, coordinatorsCount,
      eventsByState, alertsByStatusRows, reportsByState, states,
    ] = await Promise.all([
      db.from('events').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('alerts').select('id', { count: 'exact', head: true }),
      db.from('incident_reports').select('id', { count: 'exact', head: true }),
      db.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'coordinator'),
      db.from('events').select('state_id').eq('is_active', true),
      db.from('alerts').select('status'),
      db.from('incident_reports').select('state_id, status'),
      db.from('states').select('id, name, code'),
    ]);

    // State-wise breakdown
    const stateMap = {};
    (states.data || []).forEach(s => {
      stateMap[s.id] = { name: s.name, code: s.code, events: 0, reports: 0, pendingReports: 0 };
    });
    (eventsByState.data || []).forEach(e => {
      if (e.state_id && stateMap[e.state_id]) stateMap[e.state_id].events++;
    });

    const reportsByStatus = {};
    (reportsByState.data || []).forEach(r => {
      if (r.state_id && stateMap[r.state_id]) {
        stateMap[r.state_id].reports++;
        if (r.status === 'pending_review') stateMap[r.state_id].pendingReports++;
      }
      reportsByStatus[r.status] = (reportsByStatus[r.status] || 0) + 1;
    });

    const alertsByStatus = {};
    (alertsByStatusRows.data || []).forEach(a => {
      alertsByStatus[a.status] = (alertsByStatus[a.status] || 0) + 1;
    });

    res.json({
      data: {
        totals: {
          activeEvents:      eventsCount.count       || 0,
          totalAlerts:       alertsCount.count       || 0,
          totalReports:      reportsCount.count      || 0,
          totalCoordinators: coordinatorsCount.count || 0,
        },
        alertsByStatus,
        reportsByStatus,
        stateBreakdown: Object.values(stateMap).sort((a, b) => b.events - a.events),
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/audit-logs ─────────────────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, action_type } = req.query;
    let query = getDb()
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (action_type) query = query.eq('action_type', action_type);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/users ──────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { role } = req.query;
    let query = getDb()
      .from('user_profiles')
      .select('id, full_name, role, state_id, created_at, states(name, code)')
      .order('created_at', { ascending: false });
    if (role) query = query.eq('role', role);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────
const UserPatchSchema = z.object({
  role: z.enum(['citizen', 'responder', 'coordinator', 'admin']).optional(),
  state_id: z.string().uuid().nullable().optional()
});

router.patch('/users/:id', async (req, res) => {
  try {
    const parsed = UserPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    const { role, state_id } = parsed.data;
    const updates = {};
    if (role) updates.role = role;
    if (state_id !== undefined) updates.state_id = state_id;
    const { data, error } = await getDb()
      .from('user_profiles')
      .update(updates)
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
