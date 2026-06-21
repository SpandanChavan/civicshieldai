require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');
const { getAdminDb, getAnonDb } = require('../../src/lib/db');
const { app, httpServer } = require('../../src/app');

async function runSmokeTest() {
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 500));
  const api = axios.create({ baseURL: `http://localhost:${process.env.PORT || 4000}/api` });
  
  // 1. Setup mock users
  const db = getAdminDb();
  
  // Create citizen token
  const suffix = Date.now();
  const { data: citizenAuth } = await db.auth.admin.createUser({
    email: `citizen${suffix}@smoke.test`,
    password: 'password123',
    email_confirm: true
  });
  
  const { data: coordAuth } = await db.auth.admin.createUser({
    email: `coord${suffix}@smoke.test`,
    password: 'password123',
    email_confirm: true
  });
  
  // Create their user_profiles
  await db.from('user_profiles').upsert([
    { id: citizenAuth.user.id, role: 'citizen', state_id: '6902dd5c-9bb2-4fd0-a242-bbca498c323c' }, // Delhi
    { id: coordAuth.user.id, role: 'coordinator', state_id: '6902dd5c-9bb2-4fd0-a242-bbca498c323c' }
  ]);
  
  const anonDb = getAnonDb();
  
  const { data: citizenLogin } = await anonDb.auth.signInWithPassword({ email: `citizen${suffix}@smoke.test`, password: 'password123' });
  const { data: coordLogin }   = await anonDb.auth.signInWithPassword({ email: `coord${suffix}@smoke.test`, password: 'password123' });
  
  const citizenHeaders = { Authorization: `Bearer ${citizenLogin.session.access_token}` };
  const coordHeaders = { Authorization: `Bearer ${coordLogin.session.access_token}` };
  
  console.log("== Citizen Submitting Report 1 ==");
  const report1 = await api.post('/incidents', {
    title: 'Flood in CP', description: 'Water logging everywhere',
    location: { lat: 28.63, lon: 77.21 }, type: 'flood', severity: 'high'
  }, { headers: citizenHeaders });
  console.log(report1.data);
  const id1 = report1.data.data.id;
  
  console.log("== Citizen Submitting Report 2 ==");
  const report2 = await api.post('/incidents', {
    title: 'Fire in building', description: 'Huge smoke',
    location: { lat: 28.61, lon: 77.20 }, type: 'fire', severity: 'critical'
  }, { headers: citizenHeaders });
  console.log(report2.data);
  const id2 = report2.data.data.id;
  
  console.log("== Coordinator Approving Report 1 ==");
  const approve = await api.patch(`/incidents/${id1}/status`, { status: 'approved' }, { headers: coordHeaders });
  console.log(approve.data);
  
  console.log("== Coordinator Rejecting Report 2 ==");
  const reject = await api.patch(`/incidents/${id2}/status`, { status: 'rejected' }, { headers: coordHeaders });
  console.log(reject.data);
  
  console.log("== Checking DB rows ==");
  const { data: rows } = await db.from('incident_reports').select('id, status, reviewer_id, reviewed_at, state_id').in('id', [id1, id2]);
  console.log(rows);
  
  // Cleanup
  await db.from('incident_reports').delete().in('id', [id1, id2]);
  await db.from('user_profiles').delete().in('id', [citizenAuth.user.id, coordAuth.user.id]);
  await db.auth.admin.deleteUser(citizenAuth.user.id);
  await db.auth.admin.deleteUser(coordAuth.user.id);
  
  httpServer.close();
}

runSmokeTest().catch(e => {
  console.error(e.response ? e.response.data : e);
  process.exit(1);
});
