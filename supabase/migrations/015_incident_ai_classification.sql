-- ============================================================================
-- Migration 015: AI Incident Photo Classifier (feature E1)
-- Adds a JSONB column to store the ML vision-service classification of a
-- citizen's incident photo (predicted label, confidence, damage type,
-- suggested severity). Populated asynchronously by the backend after submit.
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS ai_classification JSONB;

COMMENT ON COLUMN public.incident_reports.ai_classification IS
  'ML vision result: { available, predicted_label, confidence, damage_type, suggested_severity, model }';
