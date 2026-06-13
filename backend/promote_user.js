require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function promote() {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ role: 'coordinator' })
    .neq('role', 'coordinator')
    .select();
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Promoted users to coordinator:', data);
  }
}

promote();
