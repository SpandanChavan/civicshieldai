const request = require('supertest');
const express = require('express');
const alertsRouter = require('../src/routes/alerts');

// Mock notification router
jest.mock('../src/services/notificationRouter', () => ({
  routeAlert: jest.fn().mockResolvedValue([{ channel: 'web_push', success: true }])
}));

// Mock Supabase
jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'alert-1', title: 'Test Alert', status: 'draft' } }),
      then: jest.fn((cb) => cb({ data: [{ id: 'alert-1', title: 'Test Alert' }], error: null })),
    })),
  };
});

const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRouter);

describe('Alerts API Routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/alerts should return alerts', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('data');
  });

  it('GET /api/alerts/:id should return a specific alert', async () => {
    const res = await request(app).get('/api/alerts/alert-1');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toHaveProperty('id', 'alert-1');
  });

  it('POST /api/alerts should create a new alert with valid payload', async () => {
    const res = await request(app).post('/api/alerts').send({
      title: 'Valid Test Alert',
      body: 'This is a valid body with at least 10 chars',
      severity: 'High'
    });
    expect(res.statusCode).toEqual(201);
    expect(res.body.data).toHaveProperty('id', 'alert-1');
  });

  it('POST /api/alerts should return 400 for invalid payload', async () => {
    const res = await request(app).post('/api/alerts').send({
      title: 'Bad', // too short
      body: 'Short', // too short
      severity: 'Unknown' // invalid enum
    });
    expect(res.statusCode).toEqual(400);
  });
});
