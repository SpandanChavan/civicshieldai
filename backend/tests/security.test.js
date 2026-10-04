/**
 * tests/security.test.js
 *
 * Regression tests for two cross-tenant defects found during the audit:
 *
 *   1. PATCH/DELETE /api/resources/:id had NO authentication check at all.
 *      Any caller could reassign or relocate any resource in any state.
 *
 *   2. cacheMiddleware keyed on req.originalUrl alone, while /api/events
 *      filters by req.userStateId. One coordinator's state-filtered response
 *      was therefore served to a coordinator in a different state.
 *
 * Both are silent failures — no error, no audit trail — so they need
 * explicit tests rather than relying on manual review.
 */
const request = require('supertest');
const express = require('express');

// ── Supabase mock ──────────────────────────────────────────────────────
// Records the filters applied so we can assert tenancy scoping reached the query.
const applied = { eq: [] };

jest.mock('../src/lib/db', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    eq: jest.fn(function (col, val) {
      applied.eq.push([col, val]);
      return this;
    }),
    maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'res-1' }, error: null }),
    single:      jest.fn().mockResolvedValue({ data: { id: 'res-1' }, error: null }),
    then: jest.fn((cb) => cb({ data: [{ id: 'res-1' }], error: null })),
  };
  const db = { from: jest.fn().mockReturnValue(chain), rpc: jest.fn().mockResolvedValue({ data: null }) };
  return { getAdminDb: jest.fn().mockReturnValue(db), getAnonDb: jest.fn().mockReturnValue(db) };
});

jest.mock('../src/utils/auditLogger', () => ({ logAudit: jest.fn() }));

const resourcesRouter = require('../src/routes/resources');
const eventsRouter    = require('../src/routes/events');
const alertsRouter    = require('../src/routes/alerts');
const incidentsRouter = require('../src/routes/incidents');
const { cacheMiddleware, cache } = require('../src/middleware/cache');

/** Build an app that injects a fixed identity, simulating stateScope output. */
function appAs(identity) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, identity); next(); });
  app.use('/api/resources', resourcesRouter);
  app.use('/api/events',    eventsRouter);
  app.use('/api/alerts',    alertsRouter);
  app.use('/api/incidents', incidentsRouter);
  return app;
}

const COORD_MH = { userId: 'u1', userRole: 'coordinator', userStateId: 'state-MH' };

beforeEach(() => {
  applied.eq = [];
  cache.flushAll();
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
describe('Resources write auth (cross-tenant write hole)', () => {
  const body = { status: 'deployed' };

  it('PATCH rejects an unauthenticated caller with 401', async () => {
    const res = await request(appAs({})).patch('/api/resources/res-1').send(body);
    expect(res.statusCode).toBe(401);
  });

  it('PATCH rejects an authenticated citizen with 403', async () => {
    const res = await request(appAs({ userId: 'u1', userRole: 'citizen' }))
      .patch('/api/resources/res-1').send(body);
    expect(res.statusCode).toBe(403);
  });

  it('PATCH scopes a coordinator to their own state', async () => {
    const res = await request(appAs({ userId: 'u1', userRole: 'coordinator', userStateId: 'state-MH' }))
      .patch('/api/resources/res-1').send(body);

    expect(res.statusCode).toBe(200);
    // The tenancy filter must reach the UPDATE itself — not a separate SELECT,
    // which would leave a TOCTOU window.
    expect(applied.eq).toContainEqual(['state_id', 'state-MH']);
  });

  it('PATCH rejects a coordinator with no state assignment', async () => {
    const res = await request(appAs({ userId: 'u1', userRole: 'coordinator' }))
      .patch('/api/resources/res-1').send(body);
    expect(res.statusCode).toBe(403);
  });

  it('PATCH lets an admin through unscoped', async () => {
    const res = await request(appAs({ userId: 'admin1', userRole: 'admin' }))
      .patch('/api/resources/res-1').send(body);

    expect(res.statusCode).toBe(200);
    expect(applied.eq.some(([col]) => col === 'state_id')).toBe(false);
  });

  it('DELETE rejects an unauthenticated caller with 401', async () => {
    const res = await request(appAs({})).delete('/api/resources/res-1');
    expect(res.statusCode).toBe(401);
  });

  it('DELETE scopes a coordinator to their own state', async () => {
    const res = await request(appAs({ userId: 'u1', userRole: 'coordinator', userStateId: 'state-MH' }))
      .delete('/api/resources/res-1');
    expect(res.statusCode).toBe(200);
    expect(applied.eq).toContainEqual(['state_id', 'state-MH']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('Cache key tenancy isolation', () => {
  /** Route whose payload depends on the caller's state — like /api/events. */
  function cachedApp() {
    const app = express();
    app.use((req, _res, next) => {
      const h = req.headers;
      req.userRole    = h['x-role']  || undefined;
      req.userStateId = h['x-state'] || undefined;
      next();
    });
    app.get('/api/events', cacheMiddleware(60), (req, res) => {
      res.json({ servedFor: req.userStateId || 'public' });
    });
    return app;
  }

  it('does not serve one coordinator state’s response to another', async () => {
    const app = cachedApp();

    const mh = await request(app).get('/api/events')
      .set('x-role', 'coordinator').set('x-state', 'state-MH');
    expect(mh.body.servedFor).toBe('state-MH');
    expect(mh.headers['x-cache']).toBe('MISS');

    // Identical URL, different tenant — must NOT hit Maharashtra's entry.
    const kl = await request(app).get('/api/events')
      .set('x-role', 'coordinator').set('x-state', 'state-KL');
    expect(kl.body.servedFor).toBe('state-KL');
    expect(kl.headers['x-cache']).toBe('MISS');
  });

  it('still caches within a single tenant', async () => {
    const app = cachedApp();
    await request(app).get('/api/events').set('x-role', 'coordinator').set('x-state', 'state-MH');
    const second = await request(app).get('/api/events')
      .set('x-role', 'coordinator').set('x-state', 'state-MH');

    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.servedFor).toBe('state-MH');
  });

  it('separates anonymous callers from coordinators', async () => {
    const app = cachedApp();
    await request(app).get('/api/events').set('x-role', 'coordinator').set('x-state', 'state-MH');
    const anon = await request(app).get('/api/events');

    expect(anon.headers['x-cache']).toBe('MISS');
    expect(anon.body.servedFor).toBe('public');
  });

  it('never caches a non-2xx response', async () => {
    const app = express();
    let hits = 0;
    app.get('/boom', cacheMiddleware(60), (_req, res) => {
      hits += 1;
      res.status(500).json({ error: 'upstream down' });
    });

    await request(app).get('/boom');
    await request(app).get('/boom');

    // A cached 500 would turn a transient blip into a full-TTL outage.
    expect(hits).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// A second audit pass over every write endpoint found the same cross-tenant
// pattern in three more places. All were role-gated but not state-scoped, so
// any coordinator could act on any state's rows.
describe('Cross-tenant write scoping (second audit pass)', () => {
  it('events: deactivate is scoped to the coordinator’s state', async () => {
    const res = await request(appAs(COORD_MH))
      .patch('/api/events/evt-1/deactivate').send({});

    expect([200, 404]).toContain(res.statusCode);
    expect(applied.eq).toContainEqual(['state_id', 'state-MH']);
  });

  it('events: deactivate still refuses a citizen', async () => {
    const res = await request(appAs({ userId: 'u9', userRole: 'citizen' }))
      .patch('/api/events/evt-1/deactivate').send({});
    expect(res.statusCode).toBe(403);
  });

  it('events: admin deactivate is NOT state-scoped', async () => {
    await request(appAs({ userId: 'a1', userRole: 'admin' }))
      .patch('/api/events/evt-1/deactivate').send({});
    expect(applied.eq.some(([c]) => c === 'state_id')).toBe(false);
  });

  it('alerts: delete is scoped to the coordinator’s state', async () => {
    const res = await request(appAs(COORD_MH)).delete('/api/alerts/al-1');
    expect([200, 404]).toContain(res.statusCode);
    expect(applied.eq).toContainEqual(['state_id', 'state-MH']);
  });

  it('alerts: delete refuses an unauthenticated caller', async () => {
    const res = await request(appAs({})).delete('/api/alerts/al-1');
    expect(res.statusCode).toBe(401);
  });

  it('a coordinator with no state assignment cannot write', async () => {
    const noState = { userId: 'u2', userRole: 'coordinator' };
    expect((await request(appAs(noState)).patch('/api/events/e/deactivate').send({})).statusCode).toBe(403);
    expect((await request(appAs(noState)).delete('/api/alerts/a')).statusCode).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// A third pass audited READ endpoints. Two returned personal data to
// completely unauthenticated callers.
describe('PII exposure on detail endpoints', () => {
  it('alerts: an anonymous caller does not receive delivery logs', async () => {
    // alert_logs.recipient holds recipients' emails / phone numbers / chat ids.
    await request(appAs({})).get('/api/alerts/al-1');

    const selects = require('../src/lib/db').getAdminDb().from().select.mock.calls.flat();
    expect(selects.some((a) => typeof a === 'string' && a.includes('alert_logs'))).toBe(false);
  });

  it('alerts: a coordinator does receive delivery logs', async () => {
    await request(appAs(COORD_MH)).get('/api/alerts/al-1');

    const selects = require('../src/lib/db').getAdminDb().from().select.mock.calls.flat();
    expect(selects.some((a) => typeof a === 'string' && a.includes('alert_logs'))).toBe(true);
  });

  it('incidents: detail endpoint requires authentication', async () => {
    // Returns reporter_name, reporter_contact and exact coordinates.
    const res = await request(appAs({})).get('/api/incidents/inc-1');
    expect(res.statusCode).toBe(401);
  });

  it('incidents: an unrelated citizen cannot read someone else’s report', async () => {
    const res = await request(appAs({ userId: 'other-user', userRole: 'citizen' }))
      .get('/api/incidents/inc-1');
    expect(res.statusCode).toBe(403);
  });
});
