require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function cleanStaleEvents() {
  console.log('Cleaning up stale events...');
  
  const now = new Date();
  
  // Earthquakes older than 48 hours
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const { data: q1, error: err1 } = await db.from('events')
    .update({ is_active: false })
    .eq('is_active', true)
    .in('event_type', ['Earthquake', 'Tsunami', 'Landslide'])
    .lt('detected_at', twoDaysAgo)
    .select('id');
  console.log(`Deactivated ${q1?.length || 0} stale short-term events (Earthquake, etc)`);

  // Wildfires older than 72 hours
  const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const { data: q2, error: err2 } = await db.from('events')
    .update({ is_active: false })
    .eq('is_active', true)
    .eq('event_type', 'Wildfire')
    .lt('detected_at', threeDaysAgo)
    .select('id');
  console.log(`Deactivated ${q2?.length || 0} stale wildfires`);

  // General/long events older than 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: q3, error: err3 } = await db.from('events')
    .update({ is_active: false })
    .eq('is_active', true)
    .not('event_type', 'in', '("Earthquake","Tsunami","Landslide","Wildfire")')
    .lt('detected_at', sevenDaysAgo)
    .select('id');
  console.log(`Deactivated ${q3?.length || 0} stale long-term events`);

  console.log('Cleanup complete!');
}

cleanStaleEvents();
