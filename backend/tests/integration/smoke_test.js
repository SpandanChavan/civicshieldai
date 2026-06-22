require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');
const { getAdminDb, getAnonDb } = require('../../src/lib/db');
const { app, httpServer } = require('../../src/app');

async function runSmokeTest() {
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 500));
  const api = axios.create({ baseURL: `http://localhost:${process.env.PORT || 4000}/api` });

  const db = getAdminDb();
  const anonDb = getAnonDb();
  const suffix = Date.now();
  let citizenAuth, coordAuth, id1, id2;

  try {
    // 1. Create test users
    ({ data: citizenAuth } = await db.auth.admin.createUser({
      email: `citizen${suffix}@smoke.test`,
      password: 'password123',
      email_confirm: true
    }));
    ({ data: coordAuth } = await db.auth.admin.createUser({
      email: `coord${suffix}@smoke.test`,
      password: 'password123',
      email_confirm: true
    }));

    const { data: stateId, error: stateErr } = await db.rpc('get_state_from_point', { lat: 28.63, lon: 77.21 });
    if (stateErr || !stateId) throw new Error('Failed to dynamically fetch state_id');

    const { error: upsertErr } = await db.from('user_profiles').upsert([
      { id: citizenAuth.user.id, role: 'citizen',      state_id: stateId },
      { id: coordAuth.user.id,   role: 'coordinator',  state_id: stateId }
    ]);
    if (upsertErr) throw upsertErr;

    const { data: citizenLogin } = await anonDb.auth.signInWithPassword({ email: `citizen${suffix}@smoke.test`, password: 'password123' });
    const { data: coordLogin }   = await anonDb.auth.signInWithPassword({ email: `coord${suffix}@smoke.test`,   password: 'password123' });

    const citizenHeaders = { Authorization: `Bearer ${citizenLogin.session.access_token}` };
    const coordHeaders   = { Authorization: `Bearer ${coordLogin.session.access_token}` };

    console.log("== Citizen Submitting Report 1 ==");
    const report1 = await api.post('/incidents', {
      title: 'Flood in CP', description: 'Water logging everywhere',
      location: { lat: 28.63, lon: 77.21 }, type: 'flood', severity: 'high'
    }, { headers: citizenHeaders });
    console.log(report1.data);
    id1 = report1.data.data.id;

    console.log("== Citizen Submitting Report 2 ==");
    const report2 = await api.post('/incidents', {
      title: 'Fire in building', description: 'Huge smoke',
      location: { lat: 28.61, lon: 77.20 }, type: 'fire', severity: 'critical'
    }, { headers: citizenHeaders });
    console.log(report2.data);
    id2 = report2.data.data.id;

    console.log("== Coordinator Approving Report 1 ==");
    console.log((await api.patch(`/incidents/${id1}/status`, { status: 'approved' }, { headers: coordHeaders })).data);

    console.log("== Coordinator Rejecting Report 2 ==");
    console.log((await api.patch(`/incidents/${id2}/status`, { status: 'rejected' }, { headers: coordHeaders })).data);

    console.log("== Checking DB rows ==");
    const { data: rows } = await db.from('incident_reports').select('id, status, reviewer_id, reviewed_at, state_id').in('id', [id1, id2]);
    console.log(rows);

  } catch (e) {
    console.error('Smoke test FAILED:', e.response ? e.response.data : e.message);
    process.exitCode = 1;
  } finally {
    // Always clean up — prevents orphaned rows on mid-test failure
    if (id1) await db.from('incident_reports').delete().eq('id', id1);
    if (id2) await db.from('incident_reports').delete().eq('id', id2);
    if (citizenAuth) {
      await db.from('user_profiles').delete().eq('id', citizenAuth.user.id);
      await db.auth.admin.deleteUser(citizenAuth.user.id);
    }
    if (coordAuth) {
      await db.from('user_profiles').delete().eq('id', coordAuth.user.id);
      await db.auth.admin.deleteUser(coordAuth.user.id);
    }
    httpServer.close();
    process.exit();
  }
}

runSmokeTest();
