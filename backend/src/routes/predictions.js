const express = require('express');
const axios = require('axios');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── POST /api/predictions/misinformation ─────────────────────────────
router.post('/misinformation', async (req, res) => {
  try {
    const { text, source } = req.body;
    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: 'Text must be at least 10 characters.' });
    }

    const mlResponse = await axios.post(`${ML_SERVICE_URL}/classify/misinformation`, {
      text: text.trim(),
      source: source || null,
    });

    const result = mlResponse.data;

    // Map ML label to human-readable classification
    const classificationMap = {
      reliable: 'Likely True',
      suspicious: 'Suspicious',
      misinformation: 'Likely False',
    };
    const classification = classificationMap[result.label] || 'Suspicious';

    // Credibility score 0-100
    const credibilityScore = result.label === 'reliable'
      ? Math.round(result.confidence * 100)
      : result.label === 'suspicious'
        ? Math.round((1 - result.confidence * 0.5) * 50)
        : Math.round((1 - result.confidence) * 30);

    // Persist to Supabase
    const { data: saved, error: dbError } = await supabase
      .from('misinformation_checks')
      .insert({
        input_text: text.trim().substring(0, 2000),
        credibility_score: credibilityScore,
        classification,
        confidence: Math.round(result.confidence * 100),
        is_misinformation: result.is_misinformation,
        explanation: result.explanation,
      })
      .select()
      .single();

    if (dbError) {
      console.warn('[Misinfo] DB save failed (table may not exist yet):', dbError.message);
    }

    res.json({
      id: saved?.id || null,
      classification,
      credibilityScore,
      confidence: Math.round(result.confidence * 100),
      isDisinfo: result.is_misinformation,
      explanation: result.explanation,
      label: result.label,
      analyzedAt: saved?.analyzed_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Predictions] Misinformation detection error:', error.message);
    res.status(500).json({ error: 'Failed to classify text. ML service may be unavailable.' });
  }
});

// ── GET /api/predictions/misinformation/history ──────────────────────
router.get('/misinformation/history', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('misinformation_checks')
      .select('id, input_text, credibility_score, classification, confidence, analyzed_at')
      .order('analyzed_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    console.error('[Predictions] History fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// ── GET /api/predictions/flood/:basinId ──────────────────────────────
router.get('/flood/:basinId', async (req, res) => {
  try {
    const { basinId } = req.params;
    const history = Array.from({ length: 30 }).map((_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const level = 25.0 + (i * 0.1) + (Math.random() * 2 - 1);
      return { ds: date.toISOString().split('T')[0], y: level };
    });

    const payload = { basin_id: basinId, history, danger_level: 28.5 };
    const response = await axios.post(`${ML_SERVICE_URL}/india/flood-risk`, payload);
    res.json(response.data);
  } catch (error) {
    console.error('[Predictions] Flood prediction error:', error.message);
    res.status(500).json({ error: 'Failed to generate flood prediction' });
  }
});

// ── GET /api/predictions/earthquake/:district ───────────────────────
router.get('/earthquake/:district', async (req, res) => {
  try {
    const { district } = req.params;
    const payload = { district, seismic_zone: 'IV', recent_magnitudes: [3.2, 4.1, 2.5] };
    const response = await axios.post(`${ML_SERVICE_URL}/india/earthquake-risk`, payload);
    res.json(response.data);
  } catch (error) {
    console.error('[Predictions] Earthquake risk error:', error.message);
    res.status(500).json({ error: 'Failed to compute earthquake risk' });
  }
});

// ── GET /api/predictions/heatwave/:district ─────────────────────────
router.get('/heatwave/:district', async (req, res) => {
  try {
    const { district } = req.params;
    const payload = { district, temperature_anomalies: [2.1, 3.5, 4.2, 5.0, 6.1] };
    const response = await axios.post(`${ML_SERVICE_URL}/india/heatwave-risk`, payload);
    res.json(response.data);
  } catch (error) {
    console.error('[Predictions] Heatwave prediction error:', error.message);
    res.status(500).json({ error: 'Failed to generate heatwave prediction' });
  }
});

module.exports = router;
