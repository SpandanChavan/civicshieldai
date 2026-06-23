const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');
const router = express.Router();

function getDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

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
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const [events, alerts, reports, coordinators, states] = await Promise.all([
      db.from('events').select('id, severity, event_type, state_id', { count: 'exact' }).eq('is_active', true),
      db.from('alerts').select('id, status', { count: 'exact' }),
      db.from('incident_reports').select('id, status, state_id', { count: 'exact' }),
      db.from('user_profiles').select('id, state_id, states(name, code)', { count: 'exact' }).eq('role', 'coordinator'),
      db.from('states').select('id, name, code'),
    ]);

    // State-wise breakdown
    const stateMap = {};
    (states.data || []).forEach(s => {
      stateMap[s.id] = { name: s.name, code: s.code, events: 0, reports: 0, pendingReports: 0 };
    });
    (events.data || []).forEach(e => {
      if (e.state_id && stateMap[e.state_id]) stateMap[e.state_id].events++;
    });
    (reports.data || []).forEach(r => {
      if (r.state_id && stateMap[r.state_id]) {
        stateMap[r.state_id].reports++;
        if (r.status === 'pending_review') stateMap[r.state_id].pendingReports++;
      }
    });

    const alertsBySeverity = {};
    const alertsByStatus = {};
    (alerts.data || []).forEach(a => {
      alertsByStatus[a.status] = (alertsByStatus[a.status] || 0) + 1;
    });

    const reportsByStatus = {};
    (reports.data || []).forEach(r => {
      reportsByStatus[r.status] = (reportsByStatus[r.status] || 0) + 1;
    });

    res.json({
      data: {
        totals: {
          activeEvents: events.data?.length || 0,
          totalAlerts: alerts.data?.length || 0,
          totalReports: reports.data?.length || 0,
          totalCoordinators: coordinators.data?.length || 0,
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
