require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
if (!global.WebSocket) global.WebSocket = require('ws');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  console.log('--- 🛡 CivicShield AI Schema Proof ---');
  console.log('Connecting to remote Supabase DB...\n');

  // 1. Proof of states
  const { data: states, error: statesErr } = await db.from('states').select('id', { count: 'exact' });
  if (statesErr) {
    console.error('❌ Failed to fetch states:', statesErr);
    return;
  }
  console.log(`✅ EXACTLY ${states.length} STATES EXIST IN THE DB`);

  // 2. Proof of get_state_from_point (Delhi)
  // Coordinates for New Delhi: 28.6139, 77.2090
  const { data: delhiData, error: delhiErr } = await db.rpc('get_state_from_point', { lat: 28.6139, lon: 77.2090 });
  if (delhiErr) {
    console.error('❌ Failed to resolve Delhi coordinates:', delhiErr);
  } else {
    // Fetch the state name for proof
    const { data: stateRow } = await db.from('states').select('name').eq('id', delhiData).single();
    console.log(`✅ get_state_from_point(28.6139, 77.2090) returned: ${delhiData} (${stateRow?.name})`);
  }

  // 3. Proof of get_state_from_point (Ocean / Out of Bounds)
  const { data: oceanData, error: oceanErr } = await db.rpc('get_state_from_point', { lat: 0, lon: 0 });
  if (oceanErr) {
    console.error('❌ Failed to resolve Ocean coordinates:', oceanErr);
  } else {
    console.log(`✅ get_state_from_point(0, 0) returned: ${oceanData === null ? 'NULL' : oceanData}`);
  }

  console.log('\n--- End of Proof ---');
}

run();
