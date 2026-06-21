require('dotenv').config({ path: __dirname + '/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkProfiles() {
  const { data: profiles, error: pErr } = await supabase.from('user_profiles').select('*');
  console.log('Profiles:', profiles);
  
  const { data: users, error: uErr } = await supabase.auth.admin.listUsers();
  users.users.forEach(u => {
    console.log(`User: ${u.email}, Meta:`, u.user_metadata);
  });
}

checkProfiles();
