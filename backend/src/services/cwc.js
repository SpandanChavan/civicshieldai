/**
 * cwc.js — Central Water Commission (CWC) River Flood Service
 *
 * CWC's ffs.india-water.gov.in has no open API.
 * We use the Open-Meteo Flood API (flood-api.open-meteo.com) which
 * ingests GloFAS (Global Flood Awareness System) reanalysis data —
 * the same model used by CWC for flood forecasting.
 *
 * We poll 18 key river basin monitoring points across India, covering
 * the major flood-prone basins: Brahmaputra, Ganga, Mahanadi,
 * Godavari, Krishna, Narmada, Tapti, Cauvery, Mahi, Sabarmati.
 *
 * Discharge thresholds are approximate and based on historical normals.
 * Events are generated when forecast discharge exceeds HIGH/DANGER levels.
 */

const axios = require('../utils/axiosClient');

// ── River gauge monitoring stations ──────────────────────────
// [name, river, state, lat, lon, high_m3s, danger_m3s]
const RIVER_STATIONS = [
  // Brahmaputra basin (northeast — highest flood risk)
  ['Dibrugarh',       'Brahmaputra', 'Assam',          27.4728,  94.9120,  15000, 25000],
  ['Guwahati',        'Brahmaputra', 'Assam',          26.1633,  91.7362,  20000, 35000],
  // Ganga basin
  ['Varanasi',        'Ganga',       'Uttar Pradesh',  25.3176,  83.0062,  40000, 55000],
  ['Patna',           'Ganga',       'Bihar',          25.5941,  85.1376,  45000, 60000],
  ['Kolkata',         'Hooghly',     'West Bengal',    22.5726,  88.3639,  15000, 22000],
  // Yamuna
  ['Delhi Yamuna',    'Yamuna',      'Delhi',          28.6139,  77.2090,   8000, 12000],
  ['Agra',            'Yamuna',      'Uttar Pradesh',  27.1767,  78.0081,   9000, 13000],
  // Mahanadi
  ['Cuttack',         'Mahanadi',    'Odisha',         20.4625,  85.8828,  18000, 25000],
  // Godavari
  ['Rajahmundry',     'Godavari',    'Andhra Pradesh', 16.9891,  81.7788,  45000, 60000],
  // Krishna
  ['Vijayawada',      'Krishna',     'Andhra Pradesh', 16.5062,  80.6480,  12000, 18000],
  // Narmada
  ['Bharuch',         'Narmada',     'Gujarat',        21.7051,  72.9959,  12000, 20000],
  // Tapti
  ['Surat',           'Tapti',       'Gujarat',        21.1702,  72.8311,   8000, 12000],
  // Cauvery
  ['Mettur',          'Cauvery',     'Tamil Nadu',     11.7879,  77.8009,   4000,  6000],
  // Mahi
  ['Vadodara',        'Mahi',        'Gujarat',        22.3072,  73.1812,   3000,  5000],
  // Sabarmati
  ['Ahmedabad',       'Sabarmati',   'Gujarat',        23.0225,  72.5714,   2000,  3500],
  // Indus / Chenab
  ['Jammu',           'Chenab',      'J&K',            32.7266,  74.8570,   4000,  6000],
  // Mahanadi tributaries
  ['Raipur',          'Seonath',     'Chhattisgarh',   21.2514,  81.6296,   1500,  2500],
  // Godavari tributary
  ['Nashik',          'Godavari',    'Maharashtra',    19.9975,  73.7898,   2000,  3500],
];

/**
 * Fetch river discharge forecasts for all Indian river stations.
 * Returns events where current/forecast discharge exceeds HIGH or DANGER thresholds.
 */
async function fetchCWCFloodData() {
  const lats = RIVER_STATIONS.map(s => s[3]).join(',');
  const lons = RIVER_STATIONS.map(s => s[4]).join(',');

  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lons}&daily=river_discharge&past_days=1&forecast_days=3`;

  const resp = await axios.get(url, { timeout: 15000 });
  const results = Array.isArray(resp.data) ? resp.data : [resp.data];

  const events = [];
  for (let i = 0; i < results.length; i++) {
    const station   = RIVER_STATIONS[i];
    const result    = results[i];
    if (!station || !result?.daily) continue;

    const [name, river, state, lat, lon, highThresh, dangerThresh] = station;
    const discharges = result.daily.river_discharge || [];
    const dates      = result.daily.time || [];

    // Check max of past 1 day + 3-day forecast
    const maxDischarge = Math.max(...discharges.filter(d => d !== null && d !== undefined));
    if (!maxDischarge || maxDischarge < highThresh) continue;

    const isDanger   = maxDischarge >= dangerThresh;
    const severity   = isDanger ? 'Critical' : 'High';
    const level      = isDanger ? 'Danger' : 'High Flood';
    const peakDate   = dates[discharges.indexOf(maxDischarge)] || dates[0];

    const dedupHash = `cwc-${name.toLowerCase().replace(/\s+/g, '-')}-${peakDate}`;
    const desc = `River ${river} at ${name}, ${state} — discharge ${Math.round(maxDischarge).toLocaleString('en-IN')} m³/s ` +
                 `exceeds ${level} level (${isDanger ? dangerThresh : highThresh}.toLocaleString('en-IN')} m³/s). ` +
                 `Forecast peak: ${peakDate}.`;

    events.push({
      title:       `${level} Alert: ${river} at ${name}, ${state}`,
      description: `River discharge ${Math.round(maxDischarge).toLocaleString('en-IN')} m³/s — ` +
                   `${Math.round((maxDischarge / (isDanger ? dangerThresh : highThresh)) * 100)}% of ${level} threshold. Peak: ${peakDate}.`,
      event_type:  'Flood',
      severity,
      location:    { lat, lon },
      source:      'CWC-OpenMeteo',
      dedup_hash:  dedupHash,
      detected_at: new Date(peakDate).toISOString(),
      raw_data: {
        river,
        station:    name,
        state,
        discharge_m3s: Math.round(maxDischarge),
        high_threshold:   highThresh,
        danger_threshold: dangerThresh,
        level,
        peak_date:  peakDate,
        source:     'CWC-GloFAS-OpenMeteo',
        forecast_discharges: discharges.map((d, i) => ({ date: dates[i], discharge: d })),
      },
    });
  }

  console.log(`[CWC] ${events.length} river flood alerts from ${RIVER_STATIONS.length} stations`);
  return events;
}

module.exports = { fetchCWCFloodData };
