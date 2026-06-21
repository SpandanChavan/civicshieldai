require('dotenv').config({ path: __dirname + '/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function fixTestUsers() {
  await supabase.from('user_profiles').update({ role: 'coordinator' }).eq('full_name', 'Test Coordinator');
  await supabase.from('user_profiles').update({ role: 'responder' }).eq('full_name', 'Test Responder');
  console.log('Fixed the test users roles in the database!');
}

fixTestUsers();
