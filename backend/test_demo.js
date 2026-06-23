require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BACKEND_URL = 'http://localhost:4000';

async function runDemo() {
  try {
    console.log('--- 1. SIGNUP AS CITIZEN ---');
    const citizenEmail = `citizen_${Date.now()}@example.com`;
    const citizenPass = 'password123';
    let res = await supabase.auth.signUp({
      email: citizenEmail,
      password: citizenPass,
      options: { data: { full_name: 'Test Citizen', role: 'citizen' } }
    });
    if (res.error) throw res.error;
    const citizenToken = res.data.session.access_token;
    console.log(`[Citizen Token Obtained]`);

    console.log('\n--- 2. SUBMIT INCIDENT ---');
    const incidentPayload = {
      description: 'Severe flooding on Main Street. Water levels rising rapidly.',
      reporter_name: 'Test Citizen',
      reporter_contact: '9876543210',
      category: 'flood',
      location: { lat: 19.0760, lon: 72.8777 } // Mumbai, Maharashtra
    };
    console.log('REQUEST: POST /api/incidents');
    console.log(JSON.stringify(incidentPayload, null, 2));

    let backendRes = await axios.post(`${BACKEND_URL}/api/incidents`, incidentPayload, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    console.log(`RESPONSE: ${backendRes.status} ${backendRes.statusText}`);
    console.log(JSON.stringify(backendRes.data, null, 2));
    const incidentId = backendRes.data.data.id;

    console.log('\n--- 3. SIGNUP AS COORDINATOR ---');
    // Fetch Maharashtra and Kerala state IDs
    const { data: mhState } = await supabase.from('states').select('id').eq('name', 'Maharashtra').single();
    const { data: klState } = await supabase.from('states').select('id').eq('name', 'Kerala').single();
    const mhStateId = mhState.id;
    const klStateId = klState.id;

    const coordEmail = `coord_mh_${Date.now()}@example.com`;
    let resMh = await supabase.auth.signUp({
      email: coordEmail,
      password: citizenPass,
      options: { data: { full_name: 'Test MH Coordinator', role: 'coordinator' } }
    });
    if (resMh.error) throw resMh.error;
    const mhCoordToken = resMh.data.session.access_token;
    const mhUserId = resMh.data.user.id;
    console.log(`[MH Coordinator Token Obtained]`);

    const coordEmail2 = `coord_kl_${Date.now()}@example.com`;
    let resKl = await supabase.auth.signUp({
      email: coordEmail2,
      password: citizenPass,
      options: { data: { full_name: 'Test KL Coordinator', role: 'coordinator' } }
    });
    if (resKl.error) throw resKl.error;
    const klCoordToken = resKl.data.session.access_token;
    const klUserId = resKl.data.user.id;
    console.log(`[KL Coordinator Token Obtained]`);

    // Assign state to coordinators using service role manually for test
    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);
    await supabaseAdmin.from('user_profiles').update({ state_id: mhStateId }).eq('id', mhUserId);
    await supabaseAdmin.from('user_profiles').update({ state_id: klStateId }).eq('id', klUserId);

    console.log('\n--- 4. WRONG-STATE REJECT (Should fail) ---');
    console.log(`REQUEST: PATCH /api/incidents/${incidentId}/reject (as Kerala Coord)`);
    try {
      await axios.patch(`${BACKEND_URL}/api/incidents/${incidentId}/reject`, { reason: 'Test reason' }, {
        headers: { Authorization: `Bearer ${klCoordToken}` }
      });
    } catch (err) {
      console.log(`RESPONSE: ${err.response.status} ${err.response.statusText}`);
      console.log(JSON.stringify(err.response.data, null, 2));
    }

    console.log('\n--- 5. CORRECT-STATE APPROVE (Should succeed) ---');
    console.log(`REQUEST: PATCH /api/incidents/${incidentId}/approve (as MH Coord)`);
    
    backendRes = await axios.patch(`${BACKEND_URL}/api/incidents/${incidentId}/approve`, {}, {
      headers: { Authorization: `Bearer ${mhCoordToken}` }
    });
    console.log(`RESPONSE: ${backendRes.status} ${backendRes.statusText}`);
    console.log(JSON.stringify(backendRes.data, null, 2));

  } catch (err) {
    if (err.response) {
      console.error(`ERROR RESPONSE: ${err.response.status} ${err.response.statusText}`);
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err);
    }
  }
}

runDemo();
