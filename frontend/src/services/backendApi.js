import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
const ML_URL = import.meta.env.VITE_ML_SERVICE_URL || 'http://localhost:8000';

// ── Backend API Client ────────────────────────────────
export const backendApi = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── ML Service Client ─────────────────────────────────
export const mlApi = axios.create({
  baseURL: ML_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Response interceptors ─────────────────────────────
[backendApi, mlApi].forEach((client) => {
  client.interceptors.response.use(
    (res) => res.data,
    (err) => {
      const msg = err.response?.data?.error || err.message || 'Request failed';
      console.error('[API Error]', msg);
      return Promise.reject(new Error(msg));
    }
  );
});

// ── Events API ────────────────────────────────────────
export const eventsApi = {
  getAll: (params) => backendApi.get('/events', { params }),
  getById: (id) => backendApi.get(`/events/${id}`),
  getStats: () => backendApi.get('/events/stats/summary'),
  deactivate: (id) => backendApi.patch(`/events/${id}/deactivate`),
};

// ── Alerts API ────────────────────────────────────────
export const alertsApi = {
  getAll: (params) => backendApi.get('/alerts', { params }),
  getById: (id) => backendApi.get(`/alerts/${id}`),
  create: (data) => backendApi.post('/alerts', data),
  delete: (id) => backendApi.delete(`/alerts/${id}`),
};

// ── Resources API ─────────────────────────────────────
export const resourcesApi = {
  getAll: (params) => backendApi.get('/resources', { params }),
  create: (data) => backendApi.post('/resources', data),
  update: (id, data) => backendApi.patch(`/resources/${id}`, data),
  delete: (id) => backendApi.delete(`/resources/${id}`),
};

// ── Incidents API ─────────────────────────────────────
export const incidentsApi = {
  getAll: (params) => backendApi.get('/incidents', { params }),
  getById: (id) => backendApi.get(`/incidents/${id}`),
  create: (data) => backendApi.post('/incidents', data),
  updateStatus: (id, status) => backendApi.patch(`/incidents/${id}/status`, { status }),
};

// ── ML API ────────────────────────────────────────────
export const mlApiService = {
  predictRisk: (data) => mlApi.post('/predict/risk', data),
  classifySeverity: (data) => mlApi.post('/classify/severity', data),
  detectMisinfo: (data) => mlApi.post('/classify/misinformation', data),
  optimizeRoutes: (data) => mlApi.post('/optimize/routes', data),
  allocateResources: (data) => mlApi.post('/optimize/allocate', data),
};

// ── Open-Meteo (no key) ───────────────────────────────
export const weatherApi = {
  getForecast: (lat, lon) =>
    axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat,
        longitude: lon,
        hourly: 'temperature_2m,precipitation,windspeed_10m,weathercode',
        daily: 'weathercode,temperature_2m_max,precipitation_sum',
        forecast_days: 3,
        timezone: 'Asia/Kolkata',
      },
    }).then((r) => r.data),
};

// ── OSRM Routing (no key) ─────────────────────────────
// IMPORTANT: OSRM requires LON,LAT order (not lat,lon)
export const routingApi = {
  getRoute: (from, to) =>
    axios.get(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}`,
      { params: { overview: 'full', geometries: 'geojson' } }
    ).then((r) => r.data),
};

// ── OSM Nominatim (1 req/sec max) ────────────────────
let lastNominatimCall = 0;
export const geocodeApi = {
  search: async (query) => {
    const now = Date.now();
    const wait = Math.max(0, 1100 - (now - lastNominatimCall));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimCall = Date.now();

    const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: query, format: 'json', limit: 5 },
      headers: { 'User-Agent': 'CivicShield-AI/1.0' },
    });
    return resp.data;
  },
};
