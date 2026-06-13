const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { fetchEarthquakes } = require('../services/usgsEarthquake');
const { fetchFireHotspots } = require('../services/nasaFirms');
const { fetchGdacsAlerts, fetchEonetEvents } = require('../services/gdacs');
const { fetchIndiaAlerts } = require('../services/india-alerts'); // 🇮🇳 GDACS India BBox + FloodList
const { fetchImdAlerts } = require('../services/imd');            // 🇮🇳 IMD Open-Meteo hazards
const { fetchNCSEarthquakes } = require('../services/ncs');       // 🇮🇳 NCS India Seismology
const { fetchCWCFloodData } = require('../services/cwc');         // 🇮🇳 CWC River Flood Data
const { routeAlert } = require('../services/notificationRouter');

let supabase;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabase;
}

/**
 * Upsert events to Supabase and emit Socket.io notifications.
 * Uses dedup_hash to prevent duplicates.
 */
async function upsertEvents(events, io, eventType) {
  if (!events.length) return;
  const db = getSupabase();

  // Format location as WKT POINT for PostGIS
  const formatted = events.map((e) => ({
    ...e,
    location: e.location
      ? `SRID=4326;POINT(${e.location.lon} ${e.location.lat})`
      : null,
  }));

  const { error, data } = await db
    .from('events')
    .upsert(formatted, { onConflict: 'dedup_hash', ignoreDuplicates: false })
    .select('*');

  if (error) {
    console.error(`[Cron] Upsert error for ${eventType}:`, error.message);
    return;
  }

  console.log(`[Cron] ${eventType}: upserted ${data?.length || 0} events`);
  io.emit('events:updated', { type: eventType, count: data?.length || 0 });

  // Auto-alerting for India-specific high/critical events (Proxy for SACHET)
  if (eventType === 'India' && data?.length > 0) {
    const newCriticalEvents = data.filter((e) => {
      const isHighSeverity = e.severity === 'Critical' || e.severity === 'High';
      const isNew = new Date(e.updated_at).getTime() - new Date(e.created_at).getTime() < 1000;
      return isHighSeverity && isNew;
    });

    for (const ev of newCriticalEvents) {
      console.log(`[Cron] Auto-dispatching alert for ${ev.title}`);
      
      const alertPayload = {
        title: ev.title,
        body: ev.description,
        severity: ev.severity,
        status: 'sending'
      };

      // Create an alert record
      const { data: alertRecord } = await db.from('alerts').insert(alertPayload).select().single();
      
      if (alertRecord) {
        // Send via all channels. We use default env var recipients since it's automated.
        // In a real app, you'd fetch subscribed users based on region.
        const recipients = {
          telegramChatIds: process.env.DEFAULT_TELEGRAM_CHAT_ID ? [process.env.DEFAULT_TELEGRAM_CHAT_ID] : [],
          whatsappNumbers: process.env.DEFAULT_WHATSAPP_NUMBER ? [process.env.DEFAULT_WHATSAPP_NUMBER] : [],
          smsNumbers: process.env.DEFAULT_SMS_NUMBER ? [process.env.DEFAULT_SMS_NUMBER] : [],
        };
        
        await routeAlert(alertRecord, ['telegram', 'whatsapp', 'sms', 'web_push'], recipients);
        await db.from('alerts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', alertRecord.id);
      }
    }
  }
}

/**
 * Start all background cron jobs.
 * @param {import('socket.io').Server} io - Socket.io server instance
 */
function startCronJobs(io) {
  console.log('[Cron] Starting all cron jobs...');

  // ── USGS Earthquakes every 5 minutes ──────────────
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Polling USGS earthquakes...');
    try {
      const events = await fetchEarthquakes(4.0, 2);
      await upsertEvents(events, io, 'Earthquake');
    } catch (e) {
      console.error('[Cron] USGS poll error:', e.message);
    }
  });

  // ── NASA FIRMS Fire Hotspots every 15 min (offset 3 min) ──
  cron.schedule('3,18,33,48 * * * *', async () => {
    console.log('[Cron] Polling NASA FIRMS fire hotspots...');
    try {
      const events = await fetchFireHotspots();
      await upsertEvents(events, io, 'Wildfire');
    } catch (e) {
      console.error('[Cron] FIRMS poll error:', e.message);
    }
  });

  // ── GDACS Global Alerts every 10 min (offset 6 min) ──
  cron.schedule('6,16,26,36,46,56 * * * *', async () => {
    console.log('[Cron] Polling GDACS alerts...');
    try {
      const events = await fetchGdacsAlerts();
      await upsertEvents(events, io, 'GDACS');
    } catch (e) {
      console.error('[Cron] GDACS poll error:', e.message);
    }
  });

  // ── NASA EONET Events every 10 min (offset 9 min) ──
  cron.schedule('9,19,29,39,49,59 * * * *', async () => {
    console.log('[Cron] Polling NASA EONET events...');
    try {
      const events = await fetchEonetEvents();
      await upsertEvents(events, io, 'EONET');
    } catch (e) {
      console.error('[Cron] EONET poll error:', e.message);
    }
  });

  // 🇮🇳 ── India Alerts (GDACS BBox + FloodList) every 5 min ──
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Polling India alerts (GDACS BBox + FloodList)...');
    try {
      const events = await fetchIndiaAlerts();
      if (events.length > 0) await upsertEvents(events, io, 'India');
    } catch (e) {
      console.error('[Cron] India alerts poll error:', e.message);
    }
  });

  // 🇮🇳 ── IMD Weather Hazards every 30 min (India) ───
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Polling IMD weather hazards...');
    try {
      const events = await fetchImdAlerts();
      if (events.length > 0) await upsertEvents(events, io, 'IMD');
    } catch (e) {
      console.error('[Cron] IMD poll error:', e.message);
    }
  });

  // 🇮🇳 ── NCS India Earthquakes every 5 min ──
  cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', async () => {
    console.log('[Cron] Polling NCS India earthquakes...');
    try {
      const events = await fetchNCSEarthquakes(3.0, 1);
      if (events.length > 0) await upsertEvents(events, io, 'NCS-Earthquake');
    } catch (e) {
      console.error('[Cron] NCS poll error:', e.message);
    }
  });

  // 🇮🇳 ── CWC River Flood Data every 30 min ──
  cron.schedule('15,45 * * * *', async () => {
    console.log('[Cron] Polling CWC river flood data...');
    try {
      const events = await fetchCWCFloodData();
      if (events.length > 0) await upsertEvents(events, io, 'CWC-Flood');
    } catch (e) {
      console.error('[Cron] CWC poll error:', e.message);
    }
  });

  // Run initial fetch immediately on startup
  setTimeout(async () => {
    console.log('[Cron] Running initial data fetch on startup...');
    try {
      const [quakes, fires, gdacs, eonet, india, imd, ncs, cwc] = await Promise.allSettled([
        fetchEarthquakes(4.0, 24),
        fetchFireHotspots(),
        fetchGdacsAlerts(),
        fetchEonetEvents(),
        fetchIndiaAlerts(),      // 🇮🇳 India (GDACS BBox + FloodList)
        fetchImdAlerts(),        // 🇮🇳 IMD weather hazards
        fetchNCSEarthquakes(3.5, 7), // 🇮🇳 NCS India earthquakes (last 7 days)
        fetchCWCFloodData(),     // 🇮🇳 CWC river flood data
      ]);
      if (quakes.value)  await upsertEvents(quakes.value,  io, 'Earthquake');
      if (fires.value)   await upsertEvents(fires.value,   io, 'Wildfire');
      if (gdacs.value)   await upsertEvents(gdacs.value,   io, 'GDACS');
      if (eonet.value)   await upsertEvents(eonet.value,   io, 'EONET');
      if (india.value && india.value.length) await upsertEvents(india.value, io, 'India');
      if (imd.value   && imd.value.length)   await upsertEvents(imd.value,   io, 'IMD');
      if (ncs.value   && ncs.value.length)   await upsertEvents(ncs.value,   io, 'NCS-Earthquake');
      if (cwc.value   && cwc.value.length)   await upsertEvents(cwc.value,   io, 'CWC-Flood');
    } catch (e) {
      console.error('[Cron] Initial fetch error:', e.message);
    }
  }, 3000);

  console.log('[Cron] All cron jobs scheduled ✅');

  // ── Keep-alive ping for Render free tier (DISABLED) ──
  // Reason: 2 services running 24/7 consumes 1,440 hours/month, exceeding the 750 free hours limit.
  // if (process.env.NODE_ENV === 'production' && process.env.ML_SERVICE_URL) {
  //   const axios = require('axios');
  //   cron.schedule('*/14 * * * *', async () => {
  //     try {
  //       await axios.get(`${process.env.ML_SERVICE_URL}/health`, { timeout: 5000 });
  //       console.log('[Cron] ML service keep-alive ping ✅');
  //     } catch (e) {
  //       console.warn('[Cron] ML service keep-alive failed:', e.message);
  //     }
  //   });
  //   console.log('[Cron] ML keep-alive ping scheduled (every 14 min) ✅');
  // }
}

module.exports = { startCronJobs };
