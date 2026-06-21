/**
 * ncs.js — National Centre for Seismology (NCS) India Earthquake Service
 *
 * NCS website (seismology.gov.in) has no public API, so we use:
 *   USGS FDSN with India bounding box (68–98°E, 6–38°N)
 * This gives authoritative seismological data for the Indian subcontinent
 * including the Himalayan belt (Zones IV & V), Andaman & Nicobar, and
 * the Indo-Gangetic Plain. Attribution is set to NCS/USGS.
 *
 * Runs every 5 minutes alongside the global USGS poller (which uses 4.0+ mag).
 * This service targets lower-magnitude India-specific events (3.0+) for
 * finer-grained domestic awareness.
 */

const axios = require('../utils/axiosClient');

// India seismic zone thresholds (BIS IS 1893)
const ZONE_THRESHOLDS = {
  V:   { minMag: 5.0, severity: 'Critical' },
  IV:  { minMag: 4.0, severity: 'High'     },
  III: { minMag: 3.5, severity: 'Medium'   },
  II:  { minMag: 3.0, severity: 'Low'      },
};

/**
 * Determine BIS seismic zone from coordinates (simplified lookup).
 */
function getSeismicZone(lat, lon) {
  // Zone V — Himalayan belt, Andaman & Nicobar, NE India
  if (lon >= 90 && lat <= 14)               return 'V';  // Andaman & Nicobar
  if (lat >= 33 && lon >= 73 && lon <= 79)  return 'V';  // J&K (high Himalaya)
  if (lat >= 26 && lat < 30 && lon >= 86)   return 'V';  // NE India (Assam, Meghalaya)
  if (lat >= 22 && lat < 26 && lon >= 91)   return 'V';  // Mizoram, Tripura

  // Zone IV — Delhi, Himalayan foothills, parts of NE
  if (lat >= 28 && lat <= 32 && lon >= 76 && lon <= 86)  return 'IV'; // Uttarakhand, HP, Delhi
  if (lat >= 25 && lat <= 28 && lon >= 85 && lon <= 91)  return 'IV'; // Bihar-Nepal border
  if (lat >= 20 && lat <= 25 && lon >= 91 && lon <= 95)  return 'IV'; // Manipur, Nagaland

  // Zone III — Gangetic plain, Western Ghats
  if (lat >= 22 && lat <= 28 && lon >= 72 && lon <= 85)  return 'III'; // Rajasthan-UP-Bihar
  if (lat >= 14 && lat <= 22 && lon >= 72 && lon <= 78)  return 'III'; // Western Ghats

  // Zone II — Peninsular India (stable craton)
  return 'II';
}

/**
 * Map USGS magnitude + zone to our severity labels.
 */
function getSeverity(mag, zone) {
  if (mag >= 6.0) return 'Critical';
  if (mag >= 5.0) return zone === 'V' ? 'Critical' : 'High';
  if (mag >= 4.0) return zone === 'V' ? 'High' : 'Medium';
  return 'Low';
}

/**
 * Fetch India-specific earthquakes from USGS FDSN.
 * Returns events in the standard format for apiPollers.js to upsert.
 */
async function fetchNCSEarthquakes(minMag = 3.0, dayRange = 2) {
  const endTime   = new Date().toISOString();
  const startTime = new Date(Date.now() - dayRange * 24 * 3600 * 1000).toISOString();

  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
  const params = {
    format:       'geojson',
    minmagnitude: minMag,
    minlatitude:  6,
    maxlatitude:  38,
    minlongitude: 68,
    maxlongitude: 98,
    starttime:    startTime,
    endtime:      endTime,
    orderby:      'time',
    limit:        50,
  };

  const resp = await axios.get(url, { params, timeout: 15000 });
  const features = resp.data?.features || [];

  const events = [];
  for (const f of features) {
    const p   = f.properties;
    const [lon, lat, depth] = f.geometry.coordinates;
    const zone     = getSeismicZone(lat, lon);
    const severity = getSeverity(p.mag, zone);
    const dedupHash = `ncs-${f.id}`;

    // Only include events with magnitude above zone threshold
    const zoneThreshold = ZONE_THRESHOLDS[zone]?.minMag || 3.0;
    if (p.mag < zoneThreshold) continue;

    events.push({
      title:       `M${p.mag.toFixed(1)} Earthquake — ${p.place}`,
      description: `Magnitude ${p.mag} earthquake at depth ${Math.round(depth)} km. BIS Seismic Zone ${zone}.`,
      event_type:  'Earthquake',
      severity,
      location:    { lat, lon },
      source:      'NCS-USGS',
      dedup_hash:  dedupHash,
      detected_at: new Date(f.properties.time).toISOString(),
      raw_data: {
        magnitude:   p.mag,
        depth_km:    Math.round(depth),
        seismic_zone: zone,
        place:       p.place,
        usgs_url:    p.url,
        source:      'NCS-USGS-IndiaRegion',
      },
    });
  }

  console.log(`[NCS] Fetched ${events.length} India earthquakes (≥M${minMag}, last ${dayRange}d)`);
  return events;
}

module.exports = { fetchNCSEarthquakes, getSeismicZone };
