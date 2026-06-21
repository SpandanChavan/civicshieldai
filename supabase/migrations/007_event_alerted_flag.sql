-- ====================================================
-- CivicShield AI — Migration 007: event auto-alert flag
-- Adds events.alerted_at so the cron auto-alerter is deterministic
-- (replaces the fragile "updated_at − created_at < 1s" heuristic).
-- Idempotent — safe to re-run.
-- ====================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;

-- Partial index: quickly find high/critical events not yet alerted.
CREATE INDEX IF NOT EXISTS idx_events_unalerted
  ON public.events (severity)
  WHERE alerted_at IS NULL;

-- ----------------------------------------------------
-- Gap fix: resources.state_id is used by routes/resources.js (coordinator
-- scoping + insert) but was never created by any prior migration.
-- ----------------------------------------------------
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES public.states(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resources_state ON public.resources (state_id);
