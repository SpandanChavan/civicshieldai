require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const API_BASE = 'http://localhost:4000/api'; // Assuming local server is running on 4000

async function ensureTestUser(email, password, role, stateId) {
  let { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  let user = users?.find(u => u.email === email);
  
  if (!user) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createErr) throw createErr;
    user = created.user;
  }

  // Ensure profile is correct
  const { error: upsertErr } = await supabase.from('user_profiles').upsert({
    id: user.id,
    role: role,
    state_id: stateId
  });
  if (upsertErr) throw upsertErr;

  return user;
}

async function getJwt(email, password) {
  // Use a fresh client so we don't pollute the admin client's session
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: { session }, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return session.access_token;
}

async function runProof() {
  console.log('--- 🛡 CivicShield AI End-to-End Incident Flow Proof ---');
  
  try {
    // 1. Setup users
    console.log('1. Provisioning Test Users...');
    // Look up Delhi state_id dynamically
    const { data: stateData, error: stateErr } = await supabase.rpc('get_state_from_point', { lat: 28.6139, lon: 77.2090 });
    if (stateErr || !stateData) throw new Error('Failed to dynamically fetch Delhi state_id');
    const delhiStateId = stateData;
    
    const citizen = await ensureTestUser('citizen_proof@example.com', 'securepass123', 'citizen', delhiStateId);
    const coord = await ensureTestUser('coord_proof@example.com', 'securepass123', 'coordinator', delhiStateId);
    
    const citizenToken = await getJwt('citizen_proof@example.com', 'securepass123');
    const coordToken = await getJwt('coord_proof@example.com', 'securepass123');
    console.log('✅ Citizen and Coordinator accounts ready & authenticated.\n');

    // 2. Submit Incident (Citizen)
    console.log('2. Citizen submitting flood incident...');
    const submitRes = await axios.post(`${API_BASE}/incidents`, {
      type: 'Flood',
      description: 'Severe water logging observed in central market.',
      location: { lat: 28.6139, lon: 77.2090 } // Delhi
    }, { headers: { Authorization: `Bearer ${citizenToken}` } });
    
    const incidentId = submitRes.data.data.id;
    console.log(`✅ Incident created (ID: ${incidentId}, Status: ${submitRes.data.data.status})\n`);

    // 3. Prove Deny Path (Citizen attempting to reject)
    console.log('3. Citizen attempting to reject their own incident (should be denied)...');
    try {
      await axios.patch(`${API_BASE}/incidents/${incidentId}/reject`, {
        reason: 'Nevermind'
      }, { headers: { Authorization: `Bearer ${citizenToken}` } });
      console.error('❌ Security Failure: Citizen was allowed to reject the incident!');
    } catch (e) {
      if (e.response && e.response.status === 403) {
        console.log(`✅ Access denied as expected. Server returned 403: ${e.response.data.error}\n`);
      } else {
        throw e;
      }
    }

    // 4. Reject Incident (Coordinator)
    console.log('4. Coordinator rejecting the incident (e.g. duplicate)...');
    const rejectRes = await axios.patch(`${API_BASE}/incidents/${incidentId}/reject`, {
      reason: 'Duplicate report from the same area'
    }, { headers: { Authorization: `Bearer ${coordToken}` } });
    
    console.log(`✅ Incident rejected.`);
    console.log(`   New Status: ${rejectRes.data.data.status}`);
    console.log(`   Rejection Reason: ${rejectRes.data.data.rejection_reason}\n`);
    
    // 4. Submit Another Incident & Approve (Coordinator)
    console.log('4. Submitting a second incident and approving it...');
    const submit2Res = await axios.post(`${API_BASE}/incidents`, {
      type: 'Fire',
      description: 'Small fire near the warehouse building.',
      location: { lat: 28.6139, lon: 77.2090 } 
    }, { headers: { Authorization: `Bearer ${citizenToken}` } });
    const inc2Id = submit2Res.data.data.id;
    
    const approveRes = await axios.patch(`${API_BASE}/incidents/${inc2Id}/status`, {
      status: 'approved'
    }, { headers: { Authorization: `Bearer ${coordToken}` } });
    
    console.log(`✅ Incident approved.`);
    console.log(`   New Status: ${approveRes.data.data.status}`);
    console.log(`   Reviewer ID: ${approveRes.data.data.reviewer_id}\n`);

    console.log('--- End of Proof ---');
  } catch (e) {
    console.error('❌ Proof failed:', e.response?.data || e.message);
  }
}

runProof();
