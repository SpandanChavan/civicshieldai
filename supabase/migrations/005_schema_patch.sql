-- ====================================================
-- CivicShield AI — Schema Patch (All Issues Fixed)
-- Run this in Supabase SQL Editor AFTER the original schema.
-- Fully idempotent — safe to re-run.
-- ====================================================


-- ════════════════════════════════════════════════════
-- FIX 1: Add `category` column to incident_reports
--         (was missing — blocks AI classification)
-- ════════════════════════════════════════════════════

ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS category VARCHAR(50)
  CHECK (category IN (
    'flood', 'fire', 'earthquake_damage', 'missing_person',
    'road_blockage', 'medical_emergency', 'infrastructure_damage',
    'landslide', 'cyclone', 'heatwave', 'other'
  ));

-- Also add a title column (useful for display & querying)
ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS title VARCHAR(200);

-- Index for filtering by category
CREATE INDEX IF NOT EXISTS idx_reports_category
  ON incident_reports (category, status, created_at DESC);


-- ════════════════════════════════════════════════════
-- FIX 2: RLS — coordinators/responders can read all reports
--         (previously only reporters could read their own)
-- ════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE POLICY "Responders read all reports"
    ON incident_reports FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'responder', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Coordinators/admins can update report status (verify, reject, resolve)
DO $$ BEGIN
  CREATE POLICY "Coordinators update reports"
    ON incident_reports FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ════════════════════════════════════════════════════
-- FIX 3: Enable RLS on user_profiles + add policies
--         (was completely unprotected)
-- ════════════════════════════════════════════════════

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- FIXED: We cannot query `user_profiles` inside a SELECT policy on `user_profiles` 
-- as it creates an infinite recursion loop in Postgres.
-- Profiles should generally be publicly viewable by authenticated users anyway 
-- so they can see names attached to reports.
DO $$ BEGIN
  CREATE POLICY "All authenticated users can read profiles"
    ON user_profiles FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users update own profile"
    ON user_profiles FOR UPDATE
    USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Service role full access (for backend operations)
DO $$ BEGIN
  CREATE POLICY "Service role full access to user_profiles"
    ON user_profiles FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ════════════════════════════════════════════════════
-- FIX 4: Enable RLS on misinformation_checks
--         (was completely unprotected)
-- ════════════════════════════════════════════════════

-- ROUND-2 FIX (PM): create the table BEFORE any ALTER/RLS touches it.
-- Without this, a fresh `supabase db reset` aborts the WHOLE chain here,
-- because no earlier migration ever created misinformation_checks — which
-- meant migration 006 (and everything after) never ran on a clean DB.
-- Idempotent: 006's CREATE TABLE IF NOT EXISTS becomes a harmless no-op.
CREATE TABLE IF NOT EXISTS public.misinformation_checks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text        TEXT        NOT NULL,
  credibility_score INTEGER     NOT NULL DEFAULT 50,
  classification    TEXT        NOT NULL DEFAULT 'Suspicious',
  confidence        INTEGER     NOT NULL DEFAULT 50,
  is_misinformation BOOLEAN     NOT NULL DEFAULT false,
  explanation       TEXT,
  analyzed_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE misinformation_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access to misinformation_checks"
    ON misinformation_checks FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Coordinators can read check results
DO $$ BEGIN
  CREATE POLICY "Coordinators read misinformation checks"
    ON misinformation_checks FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ════════════════════════════════════════════════════
-- FIX 5: Spatial index on alerts.target_zone
--         (was missing — geo queries did full table scan)
-- ════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_alerts_zone
  ON alerts USING GIST (target_zone);


-- ════════════════════════════════════════════════════
-- FIX 6: resources.quantity non-negative constraint
-- ════════════════════════════════════════════════════

-- Drop existing constraint if any, then re-add cleanly
ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS resources_quantity_check;

ALTER TABLE resources
  ADD CONSTRAINT resources_quantity_check CHECK (quantity >= 0);


-- ════════════════════════════════════════════════════
-- FIX 7: Link misinformation_checks → incident_reports
--         (no FK existed — broke chain of custody)
-- ════════════════════════════════════════════════════

ALTER TABLE misinformation_checks
  ADD COLUMN IF NOT EXISTS report_id UUID
  REFERENCES incident_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_misinfo_report
  ON misinformation_checks (report_id);


-- ════════════════════════════════════════════════════
-- FIX 8: Score range constraints on misinformation_checks
-- ════════════════════════════════════════════════════

ALTER TABLE misinformation_checks
  DROP CONSTRAINT IF EXISTS misinformation_checks_credibility_score_check;
ALTER TABLE misinformation_checks
  ADD CONSTRAINT misinformation_checks_credibility_score_check
  CHECK (credibility_score BETWEEN 0 AND 100);

ALTER TABLE misinformation_checks
  DROP CONSTRAINT IF EXISTS misinformation_checks_confidence_check;
ALTER TABLE misinformation_checks
  ADD CONSTRAINT misinformation_checks_confidence_check
  CHECK (confidence BETWEEN 0 AND 100);


-- ════════════════════════════════════════════════════
-- FIX 9: Add `admin` role to user_profiles
-- ════════════════════════════════════════════════════

-- Drop old constraint and recreate with admin included
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('citizen', 'coordinator', 'responder', 'admin'));


-- ════════════════════════════════════════════════════
-- FIX 10: Add recipient_type to alert_logs
--          (previously one TEXT field mixed emails/tokens/phones)
-- ════════════════════════════════════════════════════

ALTER TABLE alert_logs
  ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(20)
  CHECK (recipient_type IN ('email', 'sms', 'push', 'webhook'));


-- ════════════════════════════════════════════════════
-- FIX 11: Add `created_by` to events table
--          (alerts had it, events didn't)
-- ════════════════════════════════════════════════════

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS created_by UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;


-- ════════════════════════════════════════════════════
-- FIX 12: Explicit write policies for events + alerts
--          (service role works but coordinators with JWT couldn't write)
-- ════════════════════════════════════════════════════

-- Events: only service role or coordinators can create/update
DO $$ BEGIN
  CREATE POLICY "Service role manages events"
    ON events FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators manage events"
    ON events FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Alerts: coordinators can draft and send
DO $$ BEGIN
  CREATE POLICY "Service role manages alerts"
    ON alerts FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators manage alerts"
    ON alerts FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Resources: coordinators can manage
DO $$ BEGIN
  CREATE POLICY "Service role manages resources"
    ON resources FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators manage resources"
    ON resources FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ════════════════════════════════════════════════════
-- BONUS: push_subscriptions table (needed for web push in RC-2)
-- ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  device_info  JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own push subscriptions"
    ON push_subscriptions FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role reads all push subscriptions"
    ON push_subscriptions FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;
