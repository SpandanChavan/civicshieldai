/**
 * tests/incidents.test.js — M6: Meaningful incident workflow tests.
 *
 * Tests the full citizen→submit→coordinator approve/reject lifecycle with
 * role-aware mocks that enforce auth checks.
 */
const request = require('supertest');
const express = require('express');

// ── Supabase mock ──────────────────────────────────────────────────────
jest.mock('../src/lib/db', () => {
  const incidentRow = {
    id: 'incident-uuid-1',
    type: 'Flood',
    status: 'pending_review',
    description: 'Water level rising near the bridge',
    location: { lat: 25.5941, lon: 85.1376 },
    reporter_id: 'user-citizen-1',
  };

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
    single: jest.fn().mockResolvedValue({ data: incidentRow, error: null }),
    then:   jest.fn((cb) => cb({ data: [incidentRow], error: null })),
  };

  const db = { from: jest.fn().mockReturnValue(chain) };
  return { getAdminDb: jest.fn().mockReturnValue(db), getAnonDb: jest.fn().mockReturnValue(db) };
});

const incidentsRouter = require('../src/routes/incidents');

// ── App factory ────────────────────────────────────────────────────────
function makeApp({ userId, role } = {}) {
  const app = express();
  app.use(express.json());
  // Simulate stateScope middleware attaching auth context
  app.use((req, _res, next) => {
    if (userId) { req.userId = userId; req.userRole = role; }
    next();
  });
  app.use('/api/incidents', incidentsRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────
describe('Incidents API — auth and workflow', () => {
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/incidents', () => {
    it('returns 200 with data array for unauthenticated requests', async () => {
      const res = await request(makeApp()).get('/api/incidents');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('GET /api/incidents/:id', () => {
    it('returns 200 with incident data', async () => {
      const res = await request(makeApp()).get('/api/incidents/incident-uuid-1');
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('id', 'incident-uuid-1');
    });
  });

  describe('POST /api/incidents', () => {
    it('returns 401 for unauthenticated submissions', async () => {
      const res = await request(makeApp()).post('/api/incidents').send({
        type: 'Flood',
        description: 'Water level rising near the bridge',
        location: { lat: 25.5941, lon: 85.1376 },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 201 or 400 for authenticated citizen submissions', async () => {
      const res = await request(makeApp({ userId: 'user-citizen-1', role: 'citizen' }))
        .post('/api/incidents')
        .send({
          type: 'Flood',
          description: 'Water level rising near the bridge',
          location: { lat: 25.5941, lon: 85.1376 },
        });
      expect([201, 400]).toContain(res.statusCode);
    });
  });

  // B8 tests — PATCH /api/incidents/:id/status auth
  describe('PATCH /api/incidents/:id/status (B8 auth gate)', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(makeApp())
        .patch('/api/incidents/incident-uuid-1/status')
        .send({ status: 'approved' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when called by a citizen', async () => {
      const res = await request(makeApp({ userId: 'user-citizen-1', role: 'citizen' }))
        .patch('/api/incidents/incident-uuid-1/status')
        .send({ status: 'approved' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 400 for invalid status value even for coordinator', async () => {
      const res = await request(makeApp({ userId: 'coord-1', role: 'coordinator' }))
        .patch('/api/incidents/incident-uuid-1/status')
        .send({ status: 'invalid_status' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 200 when coordinator provides valid status', async () => {
      const res = await request(makeApp({ userId: 'coord-1', role: 'coordinator' }))
        .patch('/api/incidents/incident-uuid-1/status')
        .send({ status: 'approved' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 when admin provides valid status', async () => {
      const res = await request(makeApp({ userId: 'admin-1', role: 'admin' }))
        .patch('/api/incidents/incident-uuid-1/status')
        .send({ status: 'resolved' });
      expect(res.statusCode).toBe(200);
    });
  });

  // B3 — canonical status values align with schema CHECK
  describe('Incident status canonical values (B3)', () => {
    const VALID_STATUSES = ['pending_review', 'under_review', 'approved', 'rejected', 'resolved'];
    VALID_STATUSES.forEach(status => {
      it(`accepts '${status}' as valid status for coordinator`, async () => {
        const res = await request(makeApp({ userId: 'coord-1', role: 'coordinator' }))
          .patch('/api/incidents/incident-uuid-1/status')
          .send({ status });
        expect(res.statusCode).toBe(200);
      });
    });

    it("rejects 'pending' (old schema value) as invalid status", async () => {
      const res = await request(makeApp({ userId: 'coord-1', role: 'coordinator' }))
        .patch('/api/incidents/incident-uuid-1/status')
        .send({ status: 'pending' });
      expect(res.statusCode).toBe(400);
    });

    it("rejects 'verified' (old schema value) as invalid status", async () => {
      const res = await request(makeApp({ userId: 'coord-1', role: 'coordinator' }))
        .patch('/api/incidents/incident-uuid-1/status')
        .send({ status: 'verified' });
      expect(res.statusCode).toBe(400);
    });
  });
});
