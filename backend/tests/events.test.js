const request = require('supertest');
const express = require('express');
const eventsRouter = require('../src/routes/events');

// Mock Supabase
jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'test-event-1', location: null } }),
      then: jest.fn((cb) => cb({ data: [{ id: 'test-event-1', location: null }], error: null })),
    })),
  };
});

const app = express();
app.use(express.json());
app.use('/api/events', eventsRouter);

describe('Events API Routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/events should return a list of events', async () => {
    const res = await request(app).get('/api/events');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('count');
  });

  it('GET /api/events/:id should return a specific event', async () => {
    const res = await request(app).get('/api/events/test-event-1');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toHaveProperty('id', 'test-event-1');
  });

  it('GET /api/events/stats/summary should return stats', async () => {
    const res = await request(app).get('/api/events/stats/summary');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('data');
  });
});
