require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
global.WebSocket = require('ws');
const { getAdminDb, getAnonDb } = require('../../src/lib/db');
const { createClient } = require('@supabase/supabase-js');

async function runRLSTest() {
  console.log("=== RLS Audit Test Suite ===");
  const adminDb = getAdminDb();
  const anonDb = getAnonDb();

  // Setup
  const suffix = Date.now();
  const { data: citizen1Auth, error: e1 } = await adminDb.auth.admin.createUser({ email: `rls_cit1_${suffix}@test.local`, password: 'password123', email_confirm: true });
  const { data: citizen2Auth, error: e2 } = await adminDb.auth.admin.createUser({ email: `rls_cit2_${suffix}@test.local`, password: 'password123', email_confirm: true });
  const { data: coordAuth, error: e3 } = await adminDb.auth.admin.createUser({ email: `rls_coord_${suffix}@test.local`, password: 'password123', email_confirm: true });
  const { data: respAuth, error: e4 } = await adminDb.auth.admin.createUser({ email: `rls_resp_${suffix}@test.local`, password: 'password123', email_confirm: true });

  if (e1 || e2 || e3 || e4) console.error("Error creating users:", e1, e2, e3, e4);

  // Wait 1s for auth triggers to complete before we upsert over them
  await new Promise(resolve => setTimeout(resolve, 1000));

  const { error: e5 } = await adminDb.from('user_profiles').upsert([
    { id: citizen1Auth.user.id, role: 'citizen' },
    { id: citizen2Auth.user.id, role: 'citizen' },
    { id: coordAuth.user.id, role: 'coordinator' },
    { id: respAuth.user.id, role: 'responder' }
  ]);
  if (e5) console.error("Error upserting profiles:", e5);

  const { data: report1, error: r1err } = await adminDb.from('incident_reports').insert({
    reporter_id: citizen1Auth.user.id,
    description: 'Report owned by citizen 1',
    title: 'RLS Test Report 1',
    category: 'other',
    status: 'pending_review'
  }).select().single();
  if (r1err) console.error("Error inserting report 1:", r1err);

  const { data: report2, error: r2err } = await adminDb.from('incident_reports').insert({
    reporter_id: citizen2Auth.user.id,
    description: 'Report owned by citizen 2',
    title: 'RLS Test Report 2',
    category: 'other',
    status: 'pending_review'
  }).select().single();
  if (r2err) console.error("Error inserting report 2:", r2err);

  const { data: misinfo, error: m1err } = await adminDb.from('misinformation_checks').insert({
    input_text: 'Test misinfo',
    credibility_score: 50,
    classification: 'Suspicious',
    confidence: 50
  }).select().single();
  if (m1err) console.error("Error inserting misinfo:", m1err);

  const { data: cit1Login } = await anonDb.auth.signInWithPassword({ email: `rls_cit1_${suffix}@test.local`, password: 'password123' });
  const { data: coordLogin } = await anonDb.auth.signInWithPassword({ email: `rls_coord_${suffix}@test.local`, password: 'password123' });
  const { data: respLogin } = await anonDb.auth.signInWithPassword({ email: `rls_resp_${suffix}@test.local`, password: 'password123' });
  
  const cit1Db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${cit1Login.session.access_token}` } } });
  const coordDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${coordLogin.session.access_token}` } } });
  const respDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${respLogin.session.access_token}` } } });

  // Reset anonDb so it doesn't hold the responder session
  await anonDb.auth.signOut();

  let failures = 0;
  function assertRule(name, condition, data) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
    } else {
      console.error(`❌ FAIL: ${name}`);
      if (data !== undefined) console.error("  Got Data:", data);
      failures++;
    }
  }

  try {
    console.log("\n--- Testing anon ---");
    const { data: anonAudit, error: errAnonAudit } = await anonDb.from('audit_logs').select('*');
    assertRule("Anon cannot read audit_logs", anonAudit === null || anonAudit.length === 0, anonAudit || errAnonAudit);

    const { data: anonMisinfo, error: errAnonMisinfo } = await anonDb.from('misinformation_checks').select('*');
    assertRule("Anon cannot read misinformation_checks", anonMisinfo === null || anonMisinfo.length === 0, anonMisinfo || errAnonMisinfo);

    const { data: anonReports, error: errAnonRep } = await anonDb.from('incident_reports').select('*');
    assertRule("Anon cannot read incident_reports", anonReports === null || anonReports.length === 0, anonReports || errAnonRep);

    // Explicit test for least privilege DELETE (verifies Anon TRUNCATE/DELETE restriction)
    const { data: anonDel, error: errAnonDel } = await anonDb.from('incident_reports').delete().eq('id', report1.id).select();
    assertRule("Anon cannot DELETE/TRUNCATE incident_reports", errAnonDel !== null || (anonDel && anonDel.length === 0), errAnonDel || anonDel);

    console.log("\n--- Testing citizen ---");
    const { data: citAudit, error: errCitAud } = await cit1Db.from('audit_logs').select('*');
    assertRule("Citizen cannot read audit_logs", citAudit === null || citAudit.length === 0, citAudit || errCitAud);

    const { data: citMisinfo, error: errCitMis } = await cit1Db.from('misinformation_checks').select('*');
    assertRule("Citizen cannot read misinformation_checks", citMisinfo === null || citMisinfo.length === 0, citMisinfo || errCitMis);

    const { data: citReports, error: errCitRep } = await cit1Db.from('incident_reports').select('*').in('id', [report1.id, report2.id]);
    assertRule("Citizen can read OWN report but NOT other users' reports", citReports && citReports.length === 1 && citReports[0].id === report1.id, citReports || errCitRep);

    console.log("\n--- Testing responder ---");
    const { data: respMisinfo, error: errRespMis } = await respDb.from('misinformation_checks').select('*');
    assertRule("Responder cannot read misinformation_checks", respMisinfo === null || respMisinfo.length === 0, respMisinfo || errRespMis);

    const { data: respReports, error: errRespRep } = await respDb.from('incident_reports').select('*').in('id', [report1.id, report2.id]);
    assertRule("Responder can read ALL incident_reports", respReports && respReports.length === 2, respReports || errRespRep);

    console.log("\n--- Testing coordinator ---");
    const { data: coordMisinfo, error: errCrdMis } = await coordDb.from('misinformation_checks').select('*').eq('id', misinfo.id);
    assertRule("Coordinator can read misinformation_checks", coordMisinfo && coordMisinfo.length > 0, coordMisinfo || errCrdMis);

    const { data: coordReports, error: errCrdRep } = await coordDb.from('incident_reports').select('*').in('id', [report1.id, report2.id]);
    assertRule("Coordinator can read ALL incident_reports", coordReports && coordReports.length === 2, coordReports || errCrdRep);

    console.log("\n--- Testing service_role ---");
    const { data: srAudit, error: errSrAud } = await adminDb.from('audit_logs').select('id').limit(1);
    assertRule("Service_role can read audit_logs", srAudit !== null, errSrAud);

  } finally {
    console.log("\n--- Cleaning up ---");
    if (report1) await adminDb.from('incident_reports').delete().eq('id', report1.id);
    if (report2) await adminDb.from('incident_reports').delete().eq('id', report2.id);
    if (misinfo) await adminDb.from('misinformation_checks').delete().eq('id', misinfo.id);
    await adminDb.auth.admin.deleteUser(citizen1Auth.user.id);
    await adminDb.auth.admin.deleteUser(citizen2Auth.user.id);
    await adminDb.auth.admin.deleteUser(coordAuth.user.id);
    await adminDb.auth.admin.deleteUser(respAuth.user.id);
    
    if (failures > 0) process.exit(1);
  }
}

runRLSTest().catch(e => { console.error(e); process.exit(1); });
