const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function gatherEvidence() {
  const evidence = {};

  try {
    // 1. API Responses
    const eventsRes = await axios.get('http://localhost:4000/api/events?limit=2');
    evidence.eventsApi = eventsRes.data;

    const alertsRes = await axios.get('http://localhost:4000/api/alerts?limit=2');
    evidence.alertsApi = alertsRes.data;

    // Simulate incident POST (just show the structure if we can't post)
    evidence.incidentPayload = {
      description: "Sample incident payload",
      location: { lat: 20, lon: 78 },
      type: "Flood",
      severity: "High"
    };

    // 2. Database Row Counts
    const { count: eventsCount } = await supabase.from('events').select('*', { count: 'exact', head: true });
    const { count: alertsCount } = await supabase.from('alerts').select('*', { count: 'exact', head: true });
    const { count: incidentsCount } = await supabase.from('incidents').select('*', { count: 'exact', head: true });
    const { count: resourcesCount } = await supabase.from('resources').select('*', { count: 'exact', head: true });

    evidence.dbCounts = {
      events: eventsCount,
      alerts: alertsCount,
      incidents: incidentsCount,
      resources: resourcesCount
    };

    console.log(JSON.stringify(evidence, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error gathering evidence:", err.message);
    process.exit(1);
  }
}

gatherEvidence();
