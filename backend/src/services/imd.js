const axios = require('axios');
const crypto = require('crypto');
const { fetchWithCache } = require('./cacheService');

/**
 * IMD (India Meteorological Department) Service
 * Fetches weather warnings, cyclone alerts, and heatwave advisories
 * from India's official meteorological authority.
 *
 * API Portal: https://api.imd.gov.in (requires free registration)
 * Fallback:   Open-Meteo India-specific endpoints (no key required)
 */

const OPENMETEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPENMETEO_AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// Major Indian cities with coordinates for multi-point monitoring
const INDIA_MONITORING_POINTS = [
  // Metro cities
  { name: 'Mumbai',     state: 'Maharashtra', lat: 19.0760,  lon: 72.8777 },
  { name: 'Delhi',      state: 'Delhi',       lat: 28.6139,  lon: 77.2090 },
  { name: 'Kolkata',    state: 'West Bengal', lat: 22.5726,  lon: 88.3639 },
  { name: 'Chennai',    state: 'Tamil Nadu',  lat: 13.0827,  lon: 80.2707 },
  { name: 'Hyderabad',  state: 'Telangana',   lat: 17.3850,  lon: 78.4867 },
  { name: 'Bengaluru',  state: 'Karnataka',   lat: 12.9716,  lon: 77.5946 },
  { name: 'Ahmedabad',  state: 'Gujarat',     lat: 23.0225,  lon: 72.5714 },
  { name: 'Pune',       state: 'Maharashtra', lat: 18.5204,  lon: 73.8567 },
  // Disaster-prone zones
  { name: 'Bhubaneswar', state: 'Odisha',         lat: 20.2961, lon: 85.8245 }, // cyclone-prone
  { name: 'Patna',       state: 'Bihar',           lat: 25.5941, lon: 85.1376 }, // flood-prone
  { name: 'Guwahati',    state: 'Assam',           lat: 26.1445, lon: 91.7362 }, // flood+landslide
  { name: 'Dehradun',    state: 'Uttarakhand',     lat: 30.3165, lon: 78.0322 }, // landslide+earthquake
  { name: 'Jaipur',      state: 'Rajasthan',       lat: 26.9124, lon: 75.7873 }, // heatwave
  { name: 'Nagpur',      state: 'Maharashtra',     lat: 21.1458, lon: 79.0882 }, // heatwave
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lon: 83.2185 }, // cyclone
  { name: 'Thiruvananthapuram', state: 'Kerala',   lat: 8.5241,  lon: 76.9366 }, // flood
  { name: 'Port Blair',  state: 'Andaman & Nicobar', lat: 11.6234, lon: 92.7265 }, // tsunami-risk
  { name: 'Srinagar',    state: 'J&K',             lat: 34.0837, lon: 74.7973 }, // earthquake+flood
];

// IMD Heatwave thresholds (India-specific, as per IMD definition)
const HEATWAVE_THRESHOLD = 40; // °C (Plains), 30°C (Hills), 37°C (Coastal)
const SEVERE_HEATWAVE_THRESHOLD = 45;
const COLD_WAVE_THRESHOLD = 10; // Below normal by 4.5°C+ AND max temp ≤ 16°C
const EXTREME_COLD_THRESHOLD = 4;

// India monsoon season (June–September)
function isMonsoonSeason() {
  const month = new Date().getMonth() + 1;
  return month >= 6 && month <= 9;
}

// India cyclone seasons: Bay of Bengal (Oct-Dec), Arabian Sea (Apr-Jun)
function isCycloneSeason() {
  const month = new Date().getMonth() + 1;
  return (month >= 4 && month <= 6) || (month >= 10 && month <= 12);
}

/**
 * Fetch weather-based hazard alerts using Open-Meteo (no key required).
 * Detects: Heatwaves, Cold Waves, Extreme Rainfall events.
 *
 * NOTE: When IMD API key is obtained from api.imd.gov.in, replace with:
 * GET https://api.imd.gov.in/v1/warnings/district?apikey=YOUR_KEY
 */
async function fetchImdAlerts() {
  const cacheKey = 'imd:india:weather:hazards';
  return fetchWithCache(cacheKey, 1800, async () => { // 30 min cache
    const alerts = [];
    const now = new Date();

    // Batch fetch forecasts for all monitoring points
    // Open-Meteo supports up to daily batch queries
    const batchResults = await Promise.allSettled(
      INDIA_MONITORING_POINTS.map(point =>
        axios.get(OPENMETEO_FORECAST_URL, {
          params: {
            latitude:  point.lat,
            longitude: point.lon,
            hourly:    'temperature_2m,precipitation,windspeed_10m,weathercode',
            daily:     'temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max',
            forecast_days: 3,
            timezone:  'Asia/Kolkata',
          },
          timeout: 8000,
        }).then(res => ({ point, data: res.data }))
      )
    );

    for (const result of batchResults) {
      if (result.status !== 'fulfilled') continue;
      const { point, data } = result.value;
      const daily = data.daily;
      if (!daily) continue;

      // Check today's max temperature for heatwave
      const todayMaxTemp = daily.temperature_2m_max?.[0];
      const todayMinTemp = daily.temperature_2m_min?.[0];
      const todayRainfall = daily.precipitation_sum?.[0];
      const todayWindspeed = daily.windspeed_10m_max?.[0];

      // ── Heatwave Detection ───────────────────────────
      if (todayMaxTemp !== undefined && todayMaxTemp >= HEATWAVE_THRESHOLD) {
        const isSevere = todayMaxTemp >= SEVERE_HEATWAVE_THRESHOLD;
        alerts.push({
          source: 'IMD-OpenMeteo',
          event_type: 'Heatwave',
          title: `${isSevere ? 'Severe ' : ''}Heatwave Alert — ${point.name}, ${point.state}`,
          description: `Maximum temperature of ${todayMaxTemp}°C recorded at ${point.name}. IMD Heatwave threshold exceeded (≥${HEATWAVE_THRESHOLD}°C). ${isSevere ? 'SEVERE HEATWAVE DECLARED.' : ''} Stay indoors between 12PM–3PM. Keep hydrated.`,
          severity: isSevere ? 'Critical' : 'High',
          location: { lat: point.lat, lon: point.lon },
          raw_data: {
            city: point.name,
            state: point.state,
            max_temp: todayMaxTemp,
            min_temp: todayMinTemp,
            source_api: 'Open-Meteo (IMD equivalent)',
            date: daily.time?.[0],
          },
          dedup_hash: `imd:heatwave:${point.name.toLowerCase()}:${daily.time?.[0]}`,
          is_active: true,
        });
      }

      // ── Cold Wave Detection ──────────────────────────
      if (todayMinTemp !== undefined && todayMinTemp <= EXTREME_COLD_THRESHOLD) {
        alerts.push({
          source: 'IMD-OpenMeteo',
          event_type: 'Cold Wave',
          title: `Cold Wave Alert — ${point.name}, ${point.state}`,
          description: `Minimum temperature of ${todayMinTemp}°C recorded at ${point.name}. Cold wave conditions declared. Take precautions against exposure.`,
          severity: todayMinTemp <= 2 ? 'High' : 'Medium',
          location: { lat: point.lat, lon: point.lon },
          raw_data: {
            city: point.name,
            state: point.state,
            min_temp: todayMinTemp,
            date: daily.time?.[0],
          },
          dedup_hash: `imd:coldwave:${point.name.toLowerCase()}:${daily.time?.[0]}`,
          is_active: true,
        });
      }

      // ── Extreme Rainfall / Flood Risk ────────────────
      // IMD classifies: Heavy (64.5-115.5mm), Very Heavy (115.5-204.4mm), Extremely Heavy (>204.4mm)
      if (todayRainfall !== undefined && isMonsoonSeason()) {
        if (todayRainfall >= 204.4) {
          alerts.push({
            source: 'IMD-OpenMeteo',
            event_type: 'Flood',
            title: `Extremely Heavy Rainfall — ${point.name}, ${point.state}`,
            description: `Extremely heavy rainfall of ${todayRainfall.toFixed(1)}mm recorded at ${point.name}. High flood risk. Avoid low-lying areas and riverbanks.`,
            severity: 'Critical',
            location: { lat: point.lat, lon: point.lon },
            raw_data: { city: point.name, state: point.state, rainfall_mm: todayRainfall, date: daily.time?.[0] },
            dedup_hash: `imd:rainfall:${point.name.toLowerCase()}:${daily.time?.[0]}`,
            is_active: true,
          });
        } else if (todayRainfall >= 115.5) {
          alerts.push({
            source: 'IMD-OpenMeteo',
            event_type: 'Flood',
            title: `Very Heavy Rainfall Warning — ${point.name}, ${point.state}`,
            description: `Very heavy rainfall of ${todayRainfall.toFixed(1)}mm at ${point.name}. Flash flood risk in low-lying areas.`,
            severity: 'High',
            location: { lat: point.lat, lon: point.lon },
            raw_data: { city: point.name, state: point.state, rainfall_mm: todayRainfall, date: daily.time?.[0] },
            dedup_hash: `imd:rainfall:${point.name.toLowerCase()}:${daily.time?.[0]}`,
            is_active: true,
          });
        }
      }

      // ── High Wind / Cyclone Risk (Coastal Cities) ───
      const coastalCities = ['Bhubaneswar', 'Visakhapatnam', 'Chennai', 'Mumbai', 'Port Blair', 'Thiruvananthapuram'];
      if (todayWindspeed !== undefined && todayWindspeed >= 62 && isCycloneSeason() && coastalCities.includes(point.name)) {
        alerts.push({
          source: 'IMD-OpenMeteo',
          event_type: 'Cyclone',
          title: `Cyclone Warning — ${point.name}, ${point.state}`,
          description: `High wind speeds of ${todayWindspeed}km/h detected near ${point.name} coast. Cyclone conditions possible. Monitor IMD bulletins.`,
          severity: todayWindspeed >= 90 ? 'Critical' : 'High',
          location: { lat: point.lat, lon: point.lon },
          raw_data: { city: point.name, state: point.state, windspeed_kmh: todayWindspeed, date: daily.time?.[0] },
          dedup_hash: `imd:cyclone:${point.name.toLowerCase()}:${daily.time?.[0]}`,
          is_active: true,
        });
      }
    }

    return alerts;
  });
}

module.exports = { fetchImdAlerts };
