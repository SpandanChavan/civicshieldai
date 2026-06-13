const axios = require('../utils/axiosClient');
const { fetchWithCache } = require('./cacheService');

const USGS_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/**
 * Fetch recent earthquakes from USGS (no API key required).
 * Caches for 5 minutes.
 * @param {number} minMagnitude - Minimum magnitude (default 4.0)
 * @param {number} hoursBack    - How many hours back to query (default 1)
 */
async function fetchEarthquakes(minMagnitude = 4.0, hoursBack = 1) {
  const cacheKey = `usgs:earthquakes:m${minMagnitude}:${hoursBack}h`;

  return fetchWithCache(cacheKey, 300, async () => {
    const starttime = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
    const { data } = await axios.get(USGS_BASE, {
      params: { format: 'geojson', minmagnitude: minMagnitude, starttime },
      timeout: 10000,
    });

    return data.features.map((f) => {
      const mag = f.properties.mag;
      const [lon, lat] = f.geometry.coordinates;
      return {
        source: 'USGS',
        event_type: 'Earthquake',
        title: f.properties.title,
        description: `Magnitude ${mag} earthquake at depth ${f.geometry.coordinates[2]} km`,
        severity: mag >= 7 ? 'Critical' : mag >= 6 ? 'High' : mag >= 5 ? 'Medium' : 'Low',
        location: { lat, lon },   // stored as WKT in Supabase insert
        raw_data: f.properties,
        dedup_hash: f.id,
      };
    });
  });
}

module.exports = { fetchEarthquakes };
