const axios = require('../utils/axiosClient');
const { fetchWithCache } = require('./cacheService');

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

/**
 * Fetch fire hotspots from NASA FIRMS VIIRS SNPP NRT.
 * Coverage: India bounding box (lon 68–97, lat 8–37).
 * Caches for 15 minutes.
 */
async function fetchFireHotspots() {
  const apiKey = process.env.FIRMS_API_KEY;
  if (!apiKey) {
    console.warn('[FIRMS] FIRMS_API_KEY not set — skipping fire hotspot fetch');
    return [];
  }

  const cacheKey = 'firms:viirs:india:1d';
  return fetchWithCache(cacheKey, 900, async () => {
    // Bounding box: W_lon,S_lat,E_lon,N_lat for India
    const url = `${FIRMS_BASE}/${apiKey}/VIIRS_SNPP_NRT/68,8,97,37/1`;
    const { data } = await axios.get(url, { timeout: 15000 });

    // Parse CSV response
    const lines = data.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',');

    return lines.slice(1).map((line) => {
      const values = line.split(',');
      const row = Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      const frp = parseFloat(row.frp || '0'); // Fire Radiative Power (MW)

      return {
        source: 'NASA FIRMS',
        event_type: 'Wildfire',
        title: `Fire hotspot detected (FRP: ${frp.toFixed(1)} MW)`,
        description: `VIIRS satellite detection. Brightness: ${row.bright_ti4}K, Confidence: ${row.confidence}`,
        severity: frp > 100 ? 'Critical' : frp > 50 ? 'High' : frp > 10 ? 'Medium' : 'Low',
        location: { lat, lon },
        raw_data: row,
        dedup_hash: `firms:${row.latitude}:${row.longitude}:${row.acq_date}:${row.acq_time}`,
      };
    }).filter(e => !isNaN(e.location.lat));
  });
}

module.exports = { fetchFireHotspots };
