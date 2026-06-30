/**
 * india-alerts.js  (replaces broken sachet.js)
 *
 * Multi-source India-specific disaster alert service using verified working APIs:
 *  1. GDACS BBox API  — India bounding box filter (official UN/EU data)
 *  2. FloodList RSS   — India-tagged flood reports
 *  3. Open-Meteo     — already handled by imd.js
 *
 * WHY: SACHET (sachet.ndma.gov.in) has NO public server-side API.
 * The CapFeed page is a fully client-side Next.js app; all data loads via
 * JavaScript in the browser. Every /cap_public_website/* endpoint returns 404.
 */

const axios = require('../utils/axiosClient');
const { parseStringPromise } = require('xml2js');

// ── India bounding box (WGS84) ──
const INDIA_BBOX = {
  minLon: 68.0, minLat: 6.0,
  maxLon: 98.0, maxLat: 38.0,
};

// ── GDACS event type → our type mapping ──
const GDACS_TYPE_MAP = {
  EQ: 'Earthquake',
  TC: 'Cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  DR: 'Drought',
  WF: 'Wildfire',
  TS: 'Tsunami',
  LS: 'Landslide',
};

const GDACS_ALERT_MAP = {
  Red: 'Critical',
  Orange: 'High',
  Green: 'Low',
};

/**
 * Fetch India disasters from GDACS bounding-box API.
 * Returns events from the last 30 days within India's lat/lon bounds.
 */
async function fetchGDACSIndia() {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH` +
    `?fromdate=${fmt(from)}&todate=${fmt(now)}` +
    `&bbox=${INDIA_BBOX.minLon},${INDIA_BBOX.minLat},${INDIA_BBOX.maxLon},${INDIA_BBOX.maxLat}`;

  const resp = await axios.get(url, { timeout: 15000 });
  const features = resp.data?.features || [];

  const events = [];
  for (const f of features) {
    const p = f.properties;
    const [lon, lat] = f.geometry?.coordinates || [null, null];
    if (!lat || !lon) continue;

    // GDACS API ignores the bbox parameter, so we must manually filter
    if (lon < INDIA_BBOX.minLon || lon > INDIA_BBOX.maxLon || lat < INDIA_BBOX.minLat || lat > INDIA_BBOX.maxLat) {
      continue;
    }

    const evType = GDACS_TYPE_MAP[p.eventtype] || 'Natural Event';
    const severity = GDACS_ALERT_MAP[p.alertlevel] || 'Medium';
    const countryName = p.country || 'India';
    const title = p.name || `${evType} in ${countryName}`;
    const dedupHash = `gdacs-india-${p.eventid}-${p.episodeid}`;

    events.push({
      title,
      description: p.htmldescription?.replace(/<[^>]+>/g, '').trim() || p.description || title,
      event_type: evType,
      severity,
      location: { lat, lon },   // apiPollers will format as WKT
      source: 'GDACS-India',
      dedup_hash: dedupHash,
      is_active: p.iscurrent !== 'false',
      detected_at: p.fromdate ? new Date(p.fromdate).toISOString() : new Date().toISOString(),
      raw_data: {
        country: countryName,
        alertlevel: p.alertlevel,
        severity_text: p.severitydata?.severitytext,
        url: p.url?.report,
        source: 'GDACS-India-BBox',
      },
    });
  }

  return events;
}

/**
 * Fetch India flood reports from FloodList RSS feed,
 * filtered to India-tagged articles.
 */
async function fetchFloodListIndia() {
  const resp = await axios.get('https://www.floodlist.com/feed', {
    timeout: 15000,
    headers: { 'User-Agent': 'CivicShieldAI/1.0 (disaster monitoring)' },
  });

  const parsed = await parseStringPromise(resp.data, { explicitArray: false });
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];

  const arr = Array.isArray(items) ? items : [items];
  const indiaKeywords = [
    'India', 'Indian', 'Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad',
    'Bengal', 'Kerala', 'Maharashtra', 'Odisha', 'Assam', 'Bihar', 'Gujarat',
    'Rajasthan', 'Uttarakhand', 'Himachal', 'Andhra', 'Telangana', 'Karnataka',
    'Uttar Pradesh', 'Madhya Pradesh', 'Goa', 'Punjab', 'Haryana',
  ];

  const events = [];
  for (const item of arr) {
    const title = item.title || '';
    const description = item.description?.replace(/<[^>]+>/g, '').trim() || '';
    const combined = `${title} ${description}`;

    const isIndia = indiaKeywords.some((k) => combined.includes(k));
    if (!isIndia) continue;

    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
    // Skip if older than 14 days
    if (Date.now() - pubDate.getTime() > 14 * 24 * 60 * 60 * 1000) continue;

    const link = item.link || '';
    const dedupHash = `floodlist-${Buffer.from(link).toString('base64').slice(0, 20)}`;

    // Try to extract a state name for location
    const matchedState = indiaKeywords.find((k) => combined.includes(k) && k !== 'India' && k !== 'Indian');
    const STATE_COORDS = {
      'Kerala':       [10.8505, 76.2711],
      'Maharashtra':  [19.7515, 75.7139],
      'Bengal':       [22.9868, 87.8550],
      'Odisha':       [20.9517, 85.0985],
      'Assam':        [26.2006, 92.9376],
      'Bihar':        [25.0961, 85.3131],
      'Gujarat':      [22.2587, 71.1924],
      'Uttarakhand':  [30.0668, 79.0193],
      'Himachal':     [31.1048, 77.1734],
      'Andhra':       [15.9129, 79.7400],
      'Telangana':    [17.1232, 79.2088],
      'Karnataka':    [15.3173, 75.7139],
      'Rajasthan':    [27.0238, 74.2179],
      'Uttar Pradesh':[26.8467, 80.9462],
      'Madhya Pradesh':[22.9734, 78.6569],
      'Punjab':       [31.1471, 75.3412],
      'Haryana':      [29.0588, 76.0856],
      'Chennai':      [13.0827, 80.2707],
      'Mumbai':       [19.0760, 72.8777],
      'Delhi':        [28.6139, 77.2090],
      'Kolkata':      [22.5726, 88.3639],
      'Hyderabad':    [17.3850, 78.4867],
      'Goa':          [15.2993, 74.1240],
    };

    const coords = matchedState ? STATE_COORDS[matchedState] : [22.5937, 78.9629];
    const [lat, lon] = coords || [22.5937, 78.9629];

    // m4 FIX: use exact state centroid — jitter was causing dedup violations and map flicker
    events.push({
      title: title.replace(/&#\d+;/g, '').trim(),
      description: description.slice(0, 400),
      event_type: 'Flood',
      severity: 'High',
      location: { lat, lon },   // apiPollers formats as WKT
      source: 'FloodList',
      dedup_hash: dedupHash,
      is_active: true,
      detected_at: pubDate.toISOString(),
      raw_data: {
        country: 'India',
        state: matchedState || 'India',
        url: link,
        source: 'FloodList-RSS',
      },
    });
  }

  return events;
}

/**
 * Main export: fetch all India disaster alerts from all working sources.
 * Returns array of event objects for apiPollers.js to upsert.
 */
async function fetchIndiaAlerts() {
  const allEvents = [];

  // 1. GDACS India BBox
  try {
    const gdacsEvents = await fetchGDACSIndia();
    allEvents.push(...gdacsEvents);
    console.log(`[IndiaAlerts] GDACS India BBox: ${gdacsEvents.length} events`);
  } catch (e) {
    console.warn('[IndiaAlerts] GDACS India fetch failed:', e.message);
  }

  // 2. FloodList RSS (India-filtered)
  try {
    const floodEvents = await fetchFloodListIndia();
    allEvents.push(...floodEvents);
    console.log(`[IndiaAlerts] FloodList India: ${floodEvents.length} reports`);
  } catch (e) {
    console.warn('[IndiaAlerts] FloodList fetch failed:', e.message);
  }

  return allEvents;
}

module.exports = { fetchIndiaAlerts };
