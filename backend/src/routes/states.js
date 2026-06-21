const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

function getDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// ── GET /api/states ───────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { data, error } = await getDb()
      .from('states')
      .select('id, name, code, capital, bbox_north, bbox_south, bbox_east, bbox_west')
      .order('name');
    
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
