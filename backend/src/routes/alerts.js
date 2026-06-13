const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');
const { routeAlert } = require('../services/notificationRouter');

const router = express.Router();

function getDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// ── Zod schema for alert creation ────────────────────
const AlertSchema = z.object({
  event_id: z.string().uuid().optional(),
  title: z.string().min(5).max(200),
  body: z.string().min(10).max(2000),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  channels: z.array(z.string()).default(['web_push']),
  recipients: z.object({
    emails: z.array(z.string().email()).optional().default([]),
    telegramChatIds: z.array(z.string()).optional().default([]),
    whatsappNumbers: z.array(z.string()).optional().default([]),
    smsNumbers: z.array(z.string()).optional().default([]),
  }).optional().default({}),
});

// ── GET /api/alerts ───────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let query = getDb()
      .from('alerts')
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

// ── GET /api/alerts/:id ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await getDb()
      .from('alerts')
      .select('*, alert_logs(*)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Alert not found' });
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/alerts/subscribe ────────────────────────
router.post('/subscribe', async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    const db = getDb();
    // Upsert subscription using endpoint as the unique key
    const { error } = await db
      .from('push_subscriptions')
      .upsert({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      }, { onConflict: 'endpoint' });
      
    if (error) throw error;
    res.status(201).json({ success: true });
  } catch (e) {
    console.error('[Alerts] Subscribe error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/alerts ──────────────────────────────────
router.post('/', async (req, res) => {
  const parsed = AlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }

  const { recipients, ...alertData } = parsed.data;
  const db = getDb();

  try {
    // Create alert as 'draft'
    const { data: alert, error } = await db
      .from('alerts')
      .insert({ ...alertData, status: 'draft' })
      .select()
      .single();
    if (error) throw error;

    // Send via channels asynchronously
    (async () => {
      try {
        await db.from('alerts').update({ status: 'sending' }).eq('id', alert.id);
        const results = await routeAlert(alert, alertData.channels, recipients);

        // Log each delivery
        const logs = results.map((r) => ({
          alert_id: alert.id,
          channel: r.channel,
          recipient: r.recipient || 'broadcast',
          delivered: r.success !== false,
          error_msg: r.error || null,
        }));
        if (logs.length) await db.from('alert_logs').insert(logs);

        await db.from('alerts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', alert.id);
      } catch (err) {
        console.error('[Alerts] Send error:', err.message);
        await db.from('alerts').update({ status: 'failed' }).eq('id', alert.id);
      }
    })();

    res.status(201).json({ data: alert, message: 'Alert created and sending' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/alerts/:id ────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await getDb().from('alerts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Alert deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
