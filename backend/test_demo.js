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
    // Fetch Maharashtra state ID
    const { data: states } = await supabase.from('states').select('id').eq('name', 'Maharashtra').single();
    const mhStateId = states.id;

    const coordEmail = `coord_${Date.now()}@example.com`;
    res = await supabase.auth.signUp({
      email: coordEmail,
      password: citizenPass,
      options: { data: { full_name: 'Test Coordinator', role: 'coordinator' } }
    });
    if (res.error) throw res.error;
    const coordToken = res.data.session.access_token;
    console.log(`[Coordinator Token Obtained]`);

    // Assign state to coordinator using service role manually for test
    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);
    await supabaseAdmin.from('user_profiles').update({ state_id: mhStateId }).eq('id', res.data.user.id);

    console.log('\n--- 4. APPROVE INCIDENT ---');
    console.log(`REQUEST: PATCH /api/incidents/${incidentId}/approve`);
    
    backendRes = await axios.patch(`${BACKEND_URL}/api/incidents/${incidentId}/approve`, {}, {
      headers: { Authorization: `Bearer ${coordToken}` }
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
