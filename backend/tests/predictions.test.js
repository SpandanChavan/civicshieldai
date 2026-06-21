/**
 * tests/predictions.test.js — M6: Meaningful prediction endpoint tests.
 *
 * Mocks the ML service HTTP calls and verifies:
 * - Misinformation endpoint returns correct shape
 * - Flood/earthquake/heatwave return demo field and station info
 * - 404 for unknown district/basin
 */
const request = require('supertest');
const express = require('express');

// Mock axios BEFORE requiring routes — predictions.js uses plain 'axios' directly
jest.mock('axios', () => {
  const mockAxios = {
    get:  jest.fn(),
    post: jest.fn(),
    create: jest.fn().mockReturnThis(),
    interceptors: {
      request:  { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  };
  return mockAxios;
});

// Also mock axiosClient (used by cwc.js internals)
jest.mock('../src/utils/axiosClient', () => require('axios'));

jest.mock('../src/lib/db', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: 'misinfo-1', analyzed_at: '2026-06-21T00:00:00Z' },
      error: null,
    }),
    then:   jest.fn((cb) => cb({ data: [], error: null })),
  };
  const db = { from: jest.fn().mockReturnValue(chain) };
  return { getAdminDb: jest.fn().mockReturnValue(db) };
});

// Mock CWC and NCS services since they have their own dependencies
jest.mock('../src/services/cwc', () => ({
  RIVER_STATIONS: [
    ['Patna', 'Ganga', 'Bihar', 25.5941, 85.1376, 45000, 60000],
    ['Guwahati', 'Brahmaputra', 'Assam', 26.1633, 91.7362, 20000, 35000],
  ],
  fetchCWCFloodData: jest.fn(),
}));

jest.mock('../src/services/ncs', () => ({
  getSeismicZone: jest.fn().mockReturnValue('IV'),
  fetchNCSEarthquakes: jest.fn(),
}));

const axios = require('axios');
const predictionsRouter = require('../src/routes/predictions');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/predictions', predictionsRouter);
  return app;
}

describe('Predictions API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('POST /api/predictions/misinformation', () => {
    it('returns 400 when text is too short', async () => {
      const res = await request(makeApp())
        .post('/api/predictions/misinformation')
        .send({ text: 'short' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 200 with classification when ML service responds', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          is_misinformation: false,
          confidence: 0.9,
          label: 'reliable',
          explanation: 'No misinformation patterns detected.',
        },
      });

      const res = await request(makeApp())
        .post('/api/predictions/misinformation')
        .send({ text: 'This is a legitimate flood warning from NDMA.' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('classification');
      expect(res.body).toHaveProperty('credibilityScore');
      expect(res.body).toHaveProperty('confidence');
    });
  });

  describe('GET /api/predictions/flood/:basinId', () => {
    it('returns 404 for an unknown basin', async () => {
      const res = await request(makeApp()).get('/api/predictions/flood/nonexistent-basin');
      expect(res.statusCode).toBe(404);
    });

    it('returns prediction with demo:false when Open-Meteo data is available', async () => {
      // Mock Open-Meteo GloFAS response
      axios.get.mockResolvedValueOnce({
        data: {
          daily: {
            time: Array.from({ length: 30 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`),
            river_discharge: Array.from({ length: 30 }, (_, i) => 40000 + i * 500),
          },
        },
      });
      // Mock ML service flood-risk response
      axios.post.mockResolvedValueOnce({
        data: { india_risk_level: 'High', forecast: [], risk_level: 'High', confidence: 0.85 },
      });

      const res = await request(makeApp()).get('/api/predictions/flood/patna');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('demo', false);
      expect(res.body).toHaveProperty('source', 'Open-Meteo-GloFAS');
      expect(res.body.station).toHaveProperty('name', 'Patna');
    });

    it('labels demo:true when Open-Meteo fetch fails', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error'));
      axios.post.mockResolvedValueOnce({
        data: { india_risk_level: 'Low', forecast: [], risk_level: 'Low', confidence: 0.6 },
      });

      const res = await request(makeApp()).get('/api/predictions/flood/patna');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('demo', true);
    });
  });

  describe('GET /api/predictions/earthquake/:district', () => {
    it('returns 404 for unknown district', async () => {
      const res = await request(makeApp()).get('/api/predictions/earthquake/unknownplace');
      expect(res.statusCode).toBe(404);
    });

    it('returns prediction with real USGS data when available', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          features: [
            { properties: { mag: 3.5 } },
            { properties: { mag: 4.2 } },
          ],
        },
      });
      axios.post.mockResolvedValueOnce({
        data: { risk_score_100: 65, risk_level: 'High', seismic_zone: 'IV' },
      });

      const res = await request(makeApp()).get('/api/predictions/earthquake/delhi');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('demo', false);
      expect(res.body).toHaveProperty('source', 'USGS-FDSN');
      expect(res.body.events_found).toBe(2);
    });
  });

  describe('GET /api/predictions/heatwave/:district', () => {
    it('returns 404 for unknown district', async () => {
      const res = await request(makeApp()).get('/api/predictions/heatwave/unknownplace');
      expect(res.statusCode).toBe(404);
    });

    it('returns prediction with Open-Meteo anomalies', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          daily: {
            temperature_2m_max: [35, 36, 37, 40, 42, 41, 43, 38, 39, 40, 41, 42, 43, 44, 45],
          },
        },
      });
      axios.post.mockResolvedValueOnce({
        data: { risk_level: 'Critical', heatwave_probability_percent: 89 },
      });

      const res = await request(makeApp()).get('/api/predictions/heatwave/delhi');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('demo', false);
      expect(res.body).toHaveProperty('source', 'Open-Meteo');
      expect(Array.isArray(res.body.anomalies_used)).toBe(true);
    });
  });
});
