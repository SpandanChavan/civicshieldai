const request = require('supertest');
const express = require('express');

// ── Supabase mock ──────────────────────────────────────────────────────
// events.js now uses the getAdminDb() singleton from lib/db (previously it
// called createClient() per request), so the mock moves to lib/db to match
// the convention already used by alerts/incidents/predictions tests.
jest.mock('../src/lib/db', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: 'test-event-1', location: null }, error: null }),
    then:   jest.fn((cb) => cb({ data: [{ id: 'test-event-1', location: null }], error: null })),
  };
  const db = { from: jest.fn().mockReturnValue(chain), rpc: jest.fn().mockResolvedValue({ data: null }) };
  return { getAdminDb: jest.fn().mockReturnValue(db), getAnonDb: jest.fn().mockReturnValue(db) };
});

const eventsRouter = require('../src/routes/events');

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
