require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function listAll() {
  const { data: users, error: err1 } = await supabase.auth.admin.listUsers();
  console.log('Auth Users:', users?.users?.length, err1);

  const { data: profiles, error: err2 } = await supabase.from('user_profiles').select('*');
  console.log('Profiles:', profiles?.length, err2);
}

listAll();
