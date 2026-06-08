const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { fetchEarthquakes } = require('../services/usgsEarthquake');
const { fetchFireHotspots } = require('../services/nasaFirms');
const { fetchGdacsAlerts, fetchEonetEvents } = require('../services/gdacs');

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
    .select('id');

  if (error) {
    console.error(`[Cron] Upsert error for ${eventType}:`, error.message);
    return;
  }

  console.log(`[Cron] ${eventType}: upserted ${data?.length || 0} events`);
  io.emit('events:updated', { type: eventType, count: data?.length || 0 });
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

  // Run initial fetch immediately on startup
  setTimeout(async () => {
    console.log('[Cron] Running initial data fetch on startup...');
    try {
      const [quakes, fires, gdacs, eonet] = await Promise.allSettled([
        fetchEarthquakes(4.0, 24),
        fetchFireHotspots(),
        fetchGdacsAlerts(),
        fetchEonetEvents(),
      ]);
      if (quakes.value) await upsertEvents(quakes.value, io, 'Earthquake');
      if (fires.value) await upsertEvents(fires.value, io, 'Wildfire');
      if (gdacs.value) await upsertEvents(gdacs.value, io, 'GDACS');
      if (eonet.value) await upsertEvents(eonet.value, io, 'EONET');
    } catch (e) {
      console.error('[Cron] Initial fetch error:', e.message);
    }
  }, 3000);

  console.log('[Cron] All cron jobs scheduled ✅');
}

module.exports = { startCronJobs };
