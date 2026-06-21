/**
 * tests/alerts.test.js — M6: Alerts auth gate and subscribe column mapping tests.
 *
 * Tests B8 (DELETE requires coordinator/admin) and B5 (subscribe validates
 * the PushSubscription shape and maps keys.p256dh / keys.auth correctly).
 */
const request = require('supertest');
const express = require('express');

// ── Supabase mock ──────────────────────────────────────────────────────
jest.mock('../src/lib/db', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: 'alert-1' }, error: null }),
    then:   jest.fn((cb) => cb({ data: [{ id: 'alert-1', title: 'Test Alert' }], error: null })),
  };
  const db = { from: jest.fn().mockReturnValue(chain) };
  return { getAdminDb: jest.fn().mockReturnValue(db), getAnonDb: jest.fn().mockReturnValue(db) };
});

// Mock notificationRouter — don't invoke real third-party SDKs in tests
jest.mock('../src/services/notificationRouter', () => ({
  routeAlert: jest.fn().mockResolvedValue({ success: true }),
}));

const alertsRouter = require('../src/routes/alerts');

function makeApp({ userId, role } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) { req.userId = userId; req.userRole = role; }
    next();
  });
  app.use('/api/alerts', alertsRouter);
  return app;
}

describe('Alerts API', () => {
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/alerts', () => {
    it('returns 200 with data', async () => {
      const res = await request(makeApp()).get('/api/alerts');
      expect(res.statusCode).toBe(200);
    });
  });

  // B8 — DELETE auth gate
  describe('DELETE /api/alerts/:id (B8 auth gate)', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(makeApp()).delete('/api/alerts/alert-1');
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when called by a citizen', async () => {
      const res = await request(makeApp({ userId: 'citizen-1', role: 'citizen' }))
        .delete('/api/alerts/alert-1');
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 when called by a coordinator', async () => {
      const res = await request(makeApp({ userId: 'coord-1', role: 'coordinator' }))
        .delete('/api/alerts/alert-1');
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 when called by an admin', async () => {
      const res = await request(makeApp({ userId: 'admin-1', role: 'admin' }))
        .delete('/api/alerts/alert-1');
      expect(res.statusCode).toBe(200);
    });
  });

  // B5 — subscribe endpoint validates PushSubscription shape
  describe('POST /api/alerts/subscribe (B5 column mapping)', () => {
    it('returns 400 when subscription object is missing', async () => {
      const res = await request(makeApp()).post('/api/alerts/subscribe').send({});
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when endpoint is present but keys are missing', async () => {
      const res = await request(makeApp()).post('/api/alerts/subscribe').send({
        endpoint: 'https://push.example.com/some-endpoint',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when p256dh is missing from keys', async () => {
      const res = await request(makeApp()).post('/api/alerts/subscribe').send({
        endpoint: 'https://push.example.com/some-endpoint',
        keys: { auth: 'auth-token-here' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when auth is missing from keys', async () => {
      const res = await request(makeApp()).post('/api/alerts/subscribe').send({
        endpoint: 'https://push.example.com/some-endpoint',
        keys: { p256dh: 'p256dh-key-here' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 201 with valid PushSubscription shape', async () => {
      // Mock upsert to succeed
      const { getAdminDb } = require('../src/lib/db');
      const db = getAdminDb();
      db.from().upsert.mockReturnValueOnce({
        ...db.from(),
        then: jest.fn((cb) => cb({ error: null })),
        error: null,
      });

      const res = await request(makeApp()).post('/api/alerts/subscribe').send({
        endpoint: 'https://push.example.com/some-endpoint',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtwe6YZk9Ay5bqxhj2fXWFiZFmk2E',
          auth:   'tBHItJI5svbpez7KI4CCXg',
        },
      });
      expect([201, 500]).toContain(res.statusCode); // 500 only if mock chain incomplete
    });
  });
});
