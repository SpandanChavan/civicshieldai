import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
  const email = `citizen_${Date.now()}@example.com`;
  
  console.log('Creating new citizen user...', email);
  const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: 'Password123',
    email_confirm: true,
  });
  
  if (createErr) { console.error(createErr); process.exit(1); }

  console.log('Logging in as citizen...');
  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email,
    password: 'Password123'
  });
  if (error) { console.error(error); process.exit(1); }

  const token = data.session.access_token;
  
  console.log(`Submitting SOS request...`);
  const response = await fetch(`http://localhost:4000/api/sos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      latitude: 19.0760,
      longitude: 72.8777,
      message: 'Help, I am trapped!'
    })
  });

  console.log(`HTTP Status: ${response.status}`);
  const responseData = await response.json();
  console.log('Response Body:', JSON.stringify(responseData, null, 2));

})();
