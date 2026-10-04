const cron = require('node-cron');
const axios = require('axios');
const { getAdminDb } = require('../lib/db');
const { fetchEarthquakes } = require('../services/usgsEarthquake');
const { fetchFireHotspots } = require('../services/nasaFirms');
const { fetchGdacsAlerts, fetchEonetEvents } = require('../services/gdacs');
const { fetchIndiaAlerts } = require('../services/india-alerts'); // 🇮🇳 GDACS India BBox + FloodList
const { fetchImdAlerts } = require('../services/imd');            // 🇮🇳 IMD Open-Meteo hazards
const { fetchNCSEarthquakes } = require('../services/ncs');       // 🇮🇳 NCS India Seismology
const { fetchCWCFloodData } = require('../services/cwc');         // 🇮🇳 CWC River Flood Data
const { routeAlert } = require('../services/notificationRouter');

// India bounding box — events inside this bbox are handled by NCS (m5 dedup fix)
const INDIA_BBOX = { minLat: 6, maxLat: 38, minLon: 68, maxLon: 98 };

// ── B1: In-memory ingestion health tracker ───────────
// Keyed by eventType (e.g. 'Earthquake', 'NCS-Earthquake', 'India').
// Reset on backend restart — intentionally ephemeral (no DB writes).
const cronHealth = {};

// ── C2: ML Severity Calibration ──────────────────────
// Calls POST /classify/severity on the local ML service.
// Only overrides source severity when ML confidence > 0.80 and result differs.
// Degrades silently (returns null) if ML is unreachable or misconfigured.
const ML_SEVERITY_URL = `${process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000'}/classify/severity`;

// Circuit breaker. Without one, a down ML service costs a full 3s timeout for
// EVERY event in EVERY poll — on Render's free tier the ML dyno sleeps, so this
// is the normal case, not the edge case. After ML_FAILURE_THRESHOLD consecutive
// failures the circuit opens and calls short-circuit for ML_COOLDOWN_MS; one
// trial call is then allowed through to test recovery.
const ML_FAILURE_THRESHOLD = 5;
const ML_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let mlConsecutiveFailures = 0;
let mlCircuitOpenedAt = 0;

function mlCircuitIsOpen() {
  if (mlConsecutiveFailures < ML_FAILURE_THRESHOLD) return false;
  if (Date.now() - mlCircuitOpenedAt >= ML_COOLDOWN_MS) {
    // Cooldown elapsed — allow a single trial request through (half-open).
    mlConsecutiveFailures = ML_FAILURE_THRESHOLD - 1;
    return false;
  }
  return true;
}

async function calibrateSeverity(event) {
  if (mlCircuitIsOpen()) return null;
  try {
    const payload = {
      event_type: event.event_type || 'Unknown',
      magnitude:  event.raw_data?.mag        ?? event.raw_data?.magnitude ?? null,
      frp:        event.raw_data?.frp        ?? event.raw_data?.bright_t31 ?? null,
      wind_speed: event.raw_data?.wind_speed ?? null,
      precipitation: event.raw_data?.precipitation ?? null,
      area_affected_km2: event.raw_data?.area_km2 ?? null,
      population_density: event.raw_data?.pop_density ?? null,
    };
    const { data } = await axios.post(ML_SEVERITY_URL, payload, { timeout: 3000 });
    if (mlConsecutiveFailures > 0) {
      console.log('[Cron] ML severity service recovered — circuit closed');
      mlConsecutiveFailures = 0;
    }
    if (data?.confidence >= 0.80 && data?.severity && data.severity !== event.severity) {
      return data.severity;
    }
  } catch (_) {
    // ML service unavailable — degrade silently, but count toward the breaker.
    mlConsecutiveFailures += 1;
    if (mlConsecutiveFailures === ML_FAILURE_THRESHOLD) {
      mlCircuitOpenedAt = Date.now();
      console.warn(`[Cron] ML severity service unreachable ${ML_FAILURE_THRESHOLD}x — circuit open for ${ML_COOLDOWN_MS / 60000} min`);
    }
  }
  return null;
}

function isInIndia(lat, lon) {
  return lat >= INDIA_BBOX.minLat && lat <= INDIA_BBOX.maxLat &&
         lon >= INDIA_BBOX.minLon && lon <= INDIA_BBOX.maxLon;
}

/**
 * Upsert events to Supabase and emit Socket.io notifications.
 * Uses dedup_hash to prevent duplicates.
 */
async function upsertEvents(events, io, eventType) {
  if (!events.length) return;
  const db = getAdminDb(); // m5: singleton

  // Resolve state_id per event (N2). Cache by rounded coords (~1km) so nearby
  // points in the same batch don't each incur a get_state_from_point round-trip.
  // The cache stores the in-flight PROMISE, not the resolved value, so N events
  // sharing a cell issue exactly one RPC even when resolved concurrently.
  const stateCache = new Map();
  function resolveStateId(lat, lon) {
    // Upstream feeds occasionally emit null/NaN coordinates. Guard here so a
    // single malformed row can't reject the whole concurrency window (and, as
    // before this loop was parallelised, abort the entire poll).
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Promise.resolve(null);
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (stateCache.has(key)) return stateCache.get(key);
    const p = db.rpc('get_state_from_point', { lat, lon })
      .then(({ data }) => data || null)
      .catch(() => null);
    stateCache.set(key, p);
    return p;
  }

  // PERF: this loop used to be fully serial — one awaited state RPC plus one
  // awaited 3s ML call per event. A FIRMS batch of ~300 hotspots therefore
  // serialized into minutes of wall time and could overrun the poll interval.
  // Now events are processed in bounded-concurrency windows: the network calls
  // overlap, while CONCURRENCY caps simultaneous load on the ML service and
  // Postgres so we don't trade one bottleneck for a thundering herd.
  const CONCURRENCY = 10;
  const formatted = new Array(events.length);

  for (let start = 0; start < events.length; start += CONCURRENCY) {
    const window = events.slice(start, start + CONCURRENCY);
    await Promise.all(window.map(async (e, i) => {
      const hasCoords = e.location
        && Number.isFinite(e.location.lat)
        && Number.isFinite(e.location.lon);

      const [state_id, mlSeverity] = await Promise.all([
        hasCoords ? resolveStateId(e.location.lat, e.location.lon) : null,
        calibrateSeverity(e),
      ]);
      formatted[start + i] = {
        ...e,
        severity: mlSeverity || e.severity,
        state_id,
        location: hasCoords
          ? `SRID=4326;POINT(${e.location.lon} ${e.location.lat})`
          : null,
      };
    }));
  }

  const { error, data } = await db
    .from('events')
    .upsert(formatted, { onConflict: 'dedup_hash', ignoreDuplicates: false })
    .select('*');

  if (error) {
    console.error(`[Cron] Upsert error for ${eventType}:`, error.message);
    cronHealth[eventType] = { ...cronHealth[eventType], lastError: error.message, lastErrorAt: new Date().toISOString() };
    return;
  }

  const count = data?.length || 0;
  cronHealth[eventType] = {
    lastRun: new Date().toISOString(),
    lastCount: count,
    lastError: null,
    lastErrorAt: cronHealth[eventType]?.lastErrorAt || null,
  };
  console.log(`[Cron] ${eventType}: upserted ${count} events`);
  // M3 FIX: emit to 'public' room (all clients) instead of io.emit (no room scoping)
  io.to('public').emit('events:updated', { type: eventType, count: data?.length || 0 });

  // Auto-alerting for India-specific high/critical events (Proxy for SACHET)
  if (eventType === 'India' && data?.length > 0) {
    // Deterministic (replaces the fragile updated_at−created_at<1s heuristic):
    // alert only high/critical events that have not been alerted yet.
    const newCriticalEvents = data.filter((e) => {
      const isHighSeverity = e.severity === 'Critical' || e.severity === 'High';
      return isHighSeverity && !e.alerted_at;
    });

    for (const ev of newCriticalEvents) {
      console.log(`[Cron] Auto-dispatching alert for ${ev.title}`);

      const alertPayload = {
        title: ev.title,
        body: ev.description,
        severity: ev.severity,
        status: 'sending',
        event_id: ev.id,
        state_id: ev.state_id || null,
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

        // Stamp the event so it is never auto-alerted again (deterministic, no time heuristic)
        await db.from('events').update({ alerted_at: new Date().toISOString() }).eq('id', ev.id);
      }
    }
  }
}

/**
 * Cleanup stale events from the database automatically.
 * Different events have different Time-To-Live (TTL) before they expire.
 */
async function cleanupStaleEvents() {
  const db = getAdminDb(); // m5: singleton
  const now = new Date();
  
  // Earthquakes & short-term events older than 48 hours
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  await db.from('events').update({ is_active: false })
    .eq('is_active', true).in('event_type', ['Earthquake', 'Tsunami', 'Landslide']).lt('detected_at', twoDaysAgo);

  // Wildfires older than 72 hours
  const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  await db.from('events').update({ is_active: false })
    .eq('is_active', true).eq('event_type', 'Wildfire').lt('detected_at', threeDaysAgo);

  // General/long events older than 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.from('events').update({ is_active: false })
    .eq('is_active', true).not('event_type', 'in', '("Earthquake","Tsunami","Landslide","Wildfire")').lt('detected_at', sevenDaysAgo);
    
  console.log('[Cron] Cleaned up stale events successfully.');
}

/**
 * Start all background cron jobs.
 * @param {import('socket.io').Server} io - Socket.io server instance
 */
function startCronJobs(io) {
  console.log('[Cron] Starting all cron jobs...');

  // ── USGS Earthquakes every 5 minutes ──────────────
  // M5 FIX: exclude India-bbox events — those are handled by NCS with finer detail.
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Polling USGS earthquakes (global, ex-India)...');
    try {
      const events = await fetchEarthquakes(4.0, 2);
      // Filter out India-region events to prevent NCS/USGS dedup conflicts
      const globalOnly = events.filter(e => {
        const lat = e.location?.lat;
        const lon = e.location?.lon;
        return !isInIndia(lat, lon);
      });
      console.log(`[Cron] USGS: ${events.length} total, ${globalOnly.length} after India filter`);
      await upsertEvents(globalOnly, io, 'Earthquake');
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
  // Offset by 1 minute from the USGS poll. Both previously ran at '*/5', so
  // every fifth minute fired two ingestion batches at once — each doing state
  // RPCs and ML calls — doubling peak load for no reason. Every other poller
  // in this file is already staggered; this one was the exception.
  cron.schedule('1,6,11,16,21,26,31,36,41,46,51,56 * * * *', async () => {
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

  // ── Cleanup Stale Events every hour ──
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Running scheduled stale event cleanup...');
    try {
      await cleanupStaleEvents();
    } catch (e) {
      console.error('[Cron] Cleanup error:', e.message);
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

/**
 * B1: Return current ingestion health snapshot.
 * Called by GET /api/events/ingestion-health.
 */
function getIngestionHealth() {
  const sources = ['Earthquake', 'Wildfire', 'GDACS', 'EONET', 'India', 'IMD', 'NCS-Earthquake', 'CWC-Flood'];
  return sources.map(source => ({
    source,
    ...( cronHealth[source] || { lastRun: null, lastCount: 0, lastError: null, lastErrorAt: null } ),
  }));
}

module.exports = { startCronJobs, upsertEvents, getIngestionHealth };
