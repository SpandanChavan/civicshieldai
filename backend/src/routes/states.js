const express = require('express');
const { cacheMiddleware } = require('../middleware/cache');
const { getAnonDb: getDb } = require('../lib/db');
const router = express.Router();

// ── GET /api/states ───────────────────────────────────
// India's 36 states/UTs are static reference data — seeded once by migration
// 006 and never mutated at runtime. Caching for an hour removes a DB round-trip
// from a request the frontend makes on essentially every page load.
router.get('/', cacheMiddleware(3600), async (req, res) => {
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
