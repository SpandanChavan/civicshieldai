const express = require('express');
const axios = require('axios');
const router = express.Router();
const { getAdminDb } = require('../lib/db');

// Station data from CWC service for basinâ†’coordinates lookup
const { RIVER_STATIONS } = require('../services/cwc');
// Seismic zone lookup from NCS service
const { getSeismicZone } = require('../services/ncs');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// â”€â”€ District â†’ approximate lat/lon for prediction lookups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DISTRICT_COORDS = {
  'Delhi':          { lat: 28.6139, lon: 77.2090 },
  'Mumbai':         { lat: 19.0760, lon: 72.8777 },
  'Chennai':        { lat: 13.0827, lon: 80.2707 },
  'Kolkata':        { lat: 22.5726, lon: 88.3639 },
  'Hyderabad':      { lat: 17.3850, lon: 78.4867 },
  'Bengaluru':      { lat: 12.9716, lon: 77.5946 },
  'Ahmedabad':      { lat: 23.0225, lon: 72.5714 },
  'Pune':           { lat: 18.5204, lon: 73.8567 },
  'Jaipur':         { lat: 26.9124, lon: 75.7873 },
  'Lucknow':        { lat: 26.8467, lon: 80.9462 },
  'Patna':          { lat: 25.5941, lon: 85.1376 },
  'Bhopal':         { lat: 23.2599, lon: 77.4126 },
  'Guwahati':       { lat: 26.1445, lon: 91.7362 },
  'Bhubaneswar':    { lat: 20.2961, lon: 85.8245 },
  'Chandigarh':     { lat: 30.7333, lon: 76.7794 },
  'Shimla':         { lat: 31.1048, lon: 77.1734 },
  'Dehradun':       { lat: 30.3165, lon: 78.0322 },
  'Srinagar':       { lat: 34.0837, lon: 74.7973 },
  'Thiruvananthapuram': { lat: 8.5241, lon: 76.9366 },
  'Imphal':         { lat: 24.8170, lon: 93.9368 },
  'Kohima':         { lat: 25.6747, lon: 94.1086 },
  'Agartala':       { lat: 23.8315, lon: 91.2868 },
  'Gangtok':        { lat: 27.3389, lon: 88.6065 },
  'Shillong':       { lat: 25.5788, lon: 91.8933 },
  'Aizawl':         { lat: 23.7271, lon: 92.7176 },
  'Itanagar':       { lat: 27.0844, lon: 93.6053 },
};

function getDistrictCoords(district) {
  // Case-insensitive match
  const key = Object.keys(DISTRICT_COORDS).find(
    k => k.toLowerCase() === district.toLowerCase()
  );
  return key ? DISTRICT_COORDS[key] : null;
}

// â”€â”€ POST /api/predictions/misinformation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/misinformation', async (req, res) => {
  try {
    const { text, source } = req.body;
    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: 'Text must be at least 10 characters.' });
    }

    const mlResponse = await axios.post(`${ML_SERVICE_URL}/classify/misinformation`, {
      text: text.trim(),
      source: source || null,
    });

    const result = mlResponse.data;

    const classificationMap = {
      reliable:      'Likely True',
      suspicious:    'Suspicious',
      misinformation:'Likely False',
    };
    const classification = classificationMap[result.label] || 'Suspicious';

    const credibilityScore = result.label === 'reliable'
      ? Math.round(result.confidence * 100)
      : result.label === 'suspicious'
        ? Math.round((1 - result.confidence * 0.5) * 50)
        : Math.round((1 - result.confidence) * 30);

    // Persist to Supabase
    const { data: saved, error: dbError } = await getAdminDb()
      .from('misinformation_checks')
      .insert({
        input_text:        text.trim().substring(0, 2000),
        credibility_score: credibilityScore,
        classification,
        confidence:        Math.round(result.confidence * 100),
        is_misinformation: result.is_misinformation,
        explanation:       result.explanation,
      })
      .select()
      .single();

    if (dbError) {
      console.warn('[Misinfo] DB save failed:', dbError.message);
    }

    res.json({
      id:             saved?.id || null,
      classification,
      credibilityScore,
      confidence:     Math.round(result.confidence * 100),
      isDisinfo:      result.is_misinformation,
      explanation:    result.explanation,
      label:          result.label,
      analyzedAt:     saved?.analyzed_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Predictions] Misinformation detection error:', error.message);
    res.status(500).json({ error: 'Failed to classify text. ML service may be unavailable.' });
  }
});

// â”€â”€ GET /api/predictions/misinformation/history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/misinformation/history', async (req, res) => {
  try {
    const { data, error } = await getAdminDb()
      .from('misinformation_checks')
      .select('id, input_text, credibility_score, classification, confidence, analyzed_at')
      .order('analyzed_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    console.error('[Predictions] History fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// â”€â”€ GET /api/predictions/flood/:basinId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// M1 FIX: Fetch real GloFAS discharge from Open-Meteo for the matched station.
router.get('/flood/:basinId', async (req, res) => {
  try {
    const { basinId } = req.params;

    // Find matching station by name (case-insensitive partial match)
    const station = RIVER_STATIONS.find(s =>
      s[0].toLowerCase().replace(/\s+/g, '-') === basinId.toLowerCase() ||
      s[0].toLowerCase() === basinId.toLowerCase()
    );

    if (!station) {
      return res.status(404).json({
        error: `Basin '${basinId}' not found. Available basins: ${RIVER_STATIONS.map(s => s[0].toLowerCase().replace(/\s+/g, '-')).join(', ')}`
      });
    }

    const [name, river, state, lat, lon, highThresh, dangerThresh] = station;

    // Fetch 30-day real discharge history from Open-Meteo GloFAS
    const omUrl = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&past_days=30&forecast_days=1`;
    let daily;
    try {
      const omResp = await axios.get(omUrl, { timeout: 15000 });
      daily = Array.isArray(omResp.data) ? omResp.data[0]?.daily : omResp.data?.daily;
    } catch (e) {
      console.warn('[Predictions] Open-Meteo fetch failed, using demo data:', e.message);
      daily = null;
    }

    let history;
    let demo = false;

    if (daily?.river_discharge && daily?.time) {
      history = daily.time.map((ds, i) => ({ ds, y: daily.river_discharge[i] ?? 0 }));
    } else {
      // Genuine fallback â€” label it clearly
      demo = true;
      history = Array.from({ length: 30 }).map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return { ds: date.toISOString().split('T')[0], y: highThresh * 0.8 + (i * 50) };
      });
    }

    const payload = { basin_id: basinId, history, danger_level: dangerThresh };
    const response = await axios.post(`${ML_SERVICE_URL}/india/flood-risk`, payload);

    res.json({
      ...response.data,
      demo,
      source: demo ? 'synthetic_fallback' : 'Open-Meteo-GloFAS',
      station: { name, river, state, lat, lon },
      thresholds: { high: highThresh, danger: dangerThresh },
    });
  } catch (error) {
    console.error('[Predictions] Flood prediction error:', error.message);
    res.status(500).json({ error: 'Failed to generate flood prediction' });
  }
});

// â”€â”€ GET /api/predictions/earthquake/:district â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// M1 FIX: Fetch real USGS earthquake history for the district's coordinates.
router.get('/earthquake/:district', async (req, res) => {
  try {
    const { district } = req.params;

    const coords = getDistrictCoords(district);
    if (!coords) {
      return res.status(404).json({
        error: `District '${district}' not found. Use a major Indian city name.`
      });
    }

    const { lat, lon } = coords;
    const seismicZone = getSeismicZone(lat, lon);

    // Fetch last 30 days of earthquakes within 300km radius via USGS FDSN
    const startTime = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    let recentMagnitudes = [];
    let demo = false;

    try {
      const usgsResp = await axios.get('https://earthquake.usgs.gov/fdsnws/event/1/query', {
        params: {
          format: 'geojson',
          minmagnitude: 2.0,
          latitude: lat, longitude: lon,
          maxradiuskm: 300,
          starttime: startTime,
          orderby: 'time',
          limit: 20,
        },
        timeout: 12000,
      });
      recentMagnitudes = (usgsResp.data?.features || []).map(f => f.properties.mag);
    } catch (e) {
      console.warn('[Predictions] USGS fetch failed, using demo data:', e.message);
      demo = true;
      recentMagnitudes = [];
    }

    const payload = { district, seismic_zone: seismicZone, recent_magnitudes: recentMagnitudes };
    const response = await axios.post(`${ML_SERVICE_URL}/india/earthquake-risk`, payload);

    res.json({
      ...response.data,
      demo,
      source: demo ? 'synthetic_fallback' : 'USGS-FDSN',
      coordinates: { lat, lon },
      events_found: recentMagnitudes.length,
    });
  } catch (error) {
    console.error('[Predictions] Earthquake risk error:', error.message);
    res.status(500).json({ error: 'Failed to compute earthquake risk' });
  }
});

// â”€â”€ GET /api/predictions/heatwave/:district â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// M1 FIX: Fetch real temperature data from Open-Meteo and compute anomalies.
router.get('/heatwave/:district', async (req, res) => {
  try {
    const { district } = req.params;

    const coords = getDistrictCoords(district);
    if (!coords) {
      return res.status(404).json({
        error: `District '${district}' not found. Use a major Indian city name.`
      });
    }

    const { lat, lon } = coords;
    let temperatureAnomalies = [];
    let demo = false;

    try {
      // Fetch last 16 days of max temperature + climatological normal (1991â€“2020)
      const omResp = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: lat, longitude: lon,
          daily: 'temperature_2m_max,apparent_temperature_max',
          past_days: 14,
          forecast_days: 1,
          timezone: 'Asia/Kolkata',
          models: 'best_match',
        },
        timeout: 12000,
      });

      const daily = omResp.data?.daily;
      const temps = daily?.temperature_2m_max || [];

      // Climatological reference: approximate seasonal mean for the region
      // (India Aprilâ€“June mean ~35Â°C; use rolling 15-day mean as baseline)
      if (temps.length >= 3) {
        const baseline = temps.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(temps.length - 3, 1);
        temperatureAnomalies = temps.slice(-5).map(t => parseFloat((t - baseline).toFixed(2)));
      }
    } catch (e) {
      console.warn('[Predictions] Open-Meteo fetch failed, using demo data:', e.message);
      demo = true;
      temperatureAnomalies = [];
    }

    const payload = { district, temperature_anomalies: temperatureAnomalies };
    const response = await axios.post(`${ML_SERVICE_URL}/india/heatwave-risk`, payload);

    res.json({
      ...response.data,
      demo,
      source: demo ? 'synthetic_fallback' : 'Open-Meteo',
      coordinates: { lat, lon },
      anomalies_used: temperatureAnomalies,
    });
  } catch (error) {
    console.error('[Predictions] Heatwave prediction error:', error.message);
    res.status(500).json({ error: 'Failed to generate heatwave prediction' });
  }
});

module.exports = router;
