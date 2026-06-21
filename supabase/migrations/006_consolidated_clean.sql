-- ====================================================
-- CivicShield AI — Consolidated Clean Schema
-- Migration 006: Run this on a fresh DB (after enabling
-- PostGIS) OR as an incremental patch on an existing DB.
-- Fully idempotent — safe to re-run.
-- Fixes: B1, B2, B3, B4, B5, B6, B7
-- ====================================================

-- ════════════════════════════════════════════════════
-- STEP 0: Prerequisites
-- ════════════════════════════════════════════════════
-- Ensure uuid generation works (uuid-ossp is a fallback;
-- gen_random_uuid() is preferred and always available in PG14+)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";


-- ════════════════════════════════════════════════════
-- STEP 1 (B1): Create `states` table
-- ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  code        CHAR(2)      NOT NULL UNIQUE,
  capital     VARCHAR(100),
  bbox_north  DECIMAL(10,7),
  bbox_south  DECIMAL(10,7),
  bbox_east   DECIMAL(10,7),
  bbox_west   DECIMAL(10,7),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_states_code ON public.states (code);

ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read states"
    ON public.states FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages states"
    ON public.states FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ════════════════════════════════════════════════════
-- STEP 2 (B1): Seed all 36 Indian States / UTs
-- ON CONFLICT DO NOTHING makes this re-runnable.
-- ════════════════════════════════════════════════════
INSERT INTO public.states (name, code, capital, bbox_north, bbox_south, bbox_east, bbox_west) VALUES
  ('Andhra Pradesh',                           'AP', 'Amaravati',       19.1668060, 12.6238599, 84.7658033, 76.7600837),
  ('Arunachal Pradesh',                        'AR', 'Itanagar',        29.3745566, 26.6508630, 97.3950905, 91.5623082),
  ('Assam',                                    'AS', 'Dispur',          27.9712428, 24.1360330, 96.0124397, 89.6986005),
  ('Bihar',                                    'BR', 'Patna',           27.5216350, 24.2857164, 88.2937958, 83.3212566),
  ('Chhattisgarh',                             'CG', 'Raipur',          24.1066864, 17.7822157, 84.3959641, 80.2441803),
  ('Goa',                                      'GA', 'Panaji',          15.8007631, 14.7529315, 74.3361139, 73.6756012),
  ('Gujarat',                                  'GJ', 'Gandhinagar',     24.7118932, 20.1195321, 74.4764325, 68.1756585),
  ('Haryana',                                  'HR', 'Chandigarh',      30.9287706, 27.6526273, 77.6021432, 74.4735074),
  ('Himachal Pradesh',                         'HP', 'Shimla',          33.2556686, 30.3771701, 79.0123843, 75.5940055),
  ('Jharkhand',                                'JH', 'Ranchi',          25.3489225, 21.9700317, 87.9628253, 83.3281137),
  ('Karnataka',                                'KA', 'Bengaluru',       18.4766494, 11.5945587, 78.5875761, 74.0543908),
  ('Kerala',                                   'KL', 'Thiruvananthapuram', 12.7960559, 8.2935318, 77.4123612, 74.8640682),
  ('Madhya Pradesh',                           'MP', 'Bhopal',          26.8695616, 21.0706885, 82.8126116, 74.0293820),
  ('Maharashtra',                              'MH', 'Mumbai',          22.0302694, 15.6063596, 80.8977842, 72.6526112),
  ('Manipur',                                  'MN', 'Imphal',          25.6921015, 23.8336205, 94.7452440, 92.9707074),
  ('Meghalaya',                                'ML', 'Shillong',        26.1181651, 25.0306475, 92.8027367, 89.8144440),
  ('Mizoram',                                  'MZ', 'Aizawl',          24.5231304, 21.9400528, 93.4373696, 92.2602224),
  ('Nagaland',                                 'NL', 'Kohima',          27.0358010, 25.1984274, 95.2423775, 93.3267005),
  ('Odisha',                                   'OR', 'Bhubaneswar',     22.5675932, 17.8122733, 87.4861351, 81.3885855),
  ('Punjab',                                   'PB', 'Chandigarh',      32.5111793, 29.5429378, 76.9390583, 73.8798336),
  ('Rajasthan',                                'RJ', 'Jaipur',          30.1982530, 23.0586612, 78.2720089, 69.4844368),
  ('Sikkim',                                   'SK', 'Gangtok',         28.1240465, 27.0792596, 88.9211683, 88.0120333),
  ('Tamil Nadu',                               'TN', 'Chennai',         13.5639111,  8.0768938, 80.3592991, 76.2329467),
  ('Telangana',                                'TG', 'Hyderabad',       19.9172962, 15.8364246, 81.3226246, 77.2365850),
  ('Tripura',                                  'TR', 'Agartala',        24.5308780, 22.9376106, 92.3358500, 91.1508098),
  ('Uttar Pradesh',                            'UP', 'Lucknow',         30.4063828, 23.8706272, 84.6345091, 77.0838761),
  ('Uttarakhand',                              'UK', 'Dehradun',        31.4590160, 28.7243243, 81.0447890, 77.5713300),
  ('West Bengal',                              'WB', 'Kolkata',         27.2210674, 21.5473014, 89.8826022, 85.8196735),
  ('Andaman and Nicobar Islands',              'AN', 'Port Blair',      13.6753133,  6.7562674, 94.2773214, 92.2042072),
  ('Chandigarh',                               'CH', 'Chandigarh',      30.7949512, 30.6649740, 76.8490280, 76.7049857),
  ('Dadra and Nagar Haveli and Daman and Diu', 'DN', 'Daman',          20.7677936, 20.0473907, 73.2178258, 70.8734588),
  ('Delhi',                                    'DL', 'New Delhi',       28.8834000, 28.4041000, 77.3467000, 76.8374000),
  ('Jammu and Kashmir',                        'JK', 'Srinagar',        34.7871414, 32.2763569, 76.7803165, 73.7500338),
  ('Ladakh',                                   'LA', 'Leh',             35.6729307, 32.3357400, 79.4607280, 75.3269726),
  ('Lakshadweep',                              'LD', 'Kavaratti',       12.6010064,  8.0648198, 73.9061436, 71.5180377),
  ('Puducherry',                               'PY', 'Puducherry',      16.7617112, 10.8277210, 82.3137136, 75.5265863)
ON CONFLICT (code) DO NOTHING;


-- ════════════════════════════════════════════════════
-- STEP 3 (B6): Create get_state_from_point function
-- Returns the UUID of the state whose bounding box
-- contains the given (lat, lon). Picks the smallest
-- overlapping bbox when boundaries overlap.
-- ════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_state_from_point(lat FLOAT, lon FLOAT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  matched_id UUID;
BEGIN
  SELECT id INTO matched_id
  FROM public.states
  WHERE lat BETWEEN bbox_south AND bbox_north
    AND lon BETWEEN bbox_west  AND bbox_east
  ORDER BY
    -- Prefer most precise (smallest area) match when bboxes overlap
    (bbox_north - bbox_south) * (bbox_east - bbox_west) ASC
  LIMIT 1;

  RETURN matched_id;  -- NULL if point is outside all state bboxes
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_state_from_point(FLOAT, FLOAT) TO anon, authenticated, service_role;


-- ════════════════════════════════════════════════════
-- STEP 4 (B2): Add state_id to user_profiles
-- ════════════════════════════════════════════════════
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS state_id   UUID        REFERENCES public.states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- Ensure admin role is in the CHECK constraint (was missing until 005)
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('citizen', 'coordinator', 'responder', 'admin'));

CREATE INDEX IF NOT EXISTS idx_user_profiles_state ON public.user_profiles (state_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role  ON public.user_profiles (role);


-- ════════════════════════════════════════════════════
-- STEP 5 (B3, B2): Fix incident_reports
--   • Add missing columns (state_id, reviewer_id, reviewed_at, rejection_reason)
--   • Fix status CHECK to match what the code actually writes
-- ════════════════════════════════════════════════════
ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS state_id         UUID        REFERENCES public.states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_id      UUID        REFERENCES auth.users(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS category         VARCHAR(50) CHECK (category IN (
    'flood', 'fire', 'earthquake_damage', 'missing_person',
    'road_blockage', 'medical_emergency', 'infrastructure_damage',
    'landslide', 'cyclone', 'heatwave', 'other'
  )),
  ADD COLUMN IF NOT EXISTS title            VARCHAR(200);

-- Migrate any existing rows from old status values to new canonical values
UPDATE public.incident_reports SET status = 'pending_review' WHERE status = 'pending';
UPDATE public.incident_reports SET status = 'approved'       WHERE status = 'verified';

-- Drop the old inline CHECK (Postgres auto-names it incident_reports_status_check)
ALTER TABLE public.incident_reports
  DROP CONSTRAINT IF EXISTS incident_reports_status_check;

-- Add the canonical status set that matches the code
ALTER TABLE public.incident_reports
  ADD CONSTRAINT incident_reports_status_check
  CHECK (status IN ('pending_review', 'under_review', 'approved', 'rejected', 'resolved'));

CREATE INDEX IF NOT EXISTS idx_reports_state    ON public.incident_reports (state_id);
CREATE INDEX IF NOT EXISTS idx_reports_reviewer ON public.incident_reports (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reports_category ON public.incident_reports (category, status, created_at DESC);


-- ════════════════════════════════════════════════════
-- STEP 6 (B2): Add state_id to events and alerts
-- ════════════════════════════════════════════════════
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS state_id  UUID REFERENCES public.states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id)   ON DELETE SET NULL;

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS state_id  UUID REFERENCES public.states(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_state ON public.events (state_id);
CREATE INDEX IF NOT EXISTS idx_alerts_state ON public.alerts (state_id);


-- ════════════════════════════════════════════════════
-- STEP 7 (B4): Create misinformation_checks table
-- MUST be created BEFORE any ALTER TABLE or RLS on it.
-- ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.misinformation_checks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text       TEXT        NOT NULL,
  credibility_score INTEGER    NOT NULL CHECK (credibility_score BETWEEN 0 AND 100),
  classification   TEXT        NOT NULL,
  confidence       INTEGER     NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  is_misinformation BOOLEAN    NOT NULL DEFAULT false,
  explanation      TEXT,
  report_id        UUID        REFERENCES public.incident_reports(id) ON DELETE SET NULL,
  analyzed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misinfo_report     ON public.misinformation_checks (report_id);
CREATE INDEX IF NOT EXISTS idx_misinfo_analyzed   ON public.misinformation_checks (analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_misinfo_is_misinfo ON public.misinformation_checks (is_misinformation, analyzed_at DESC);

ALTER TABLE public.misinformation_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access to misinformation_checks"
    ON public.misinformation_checks FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators read misinformation checks"
    ON public.misinformation_checks FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ════════════════════════════════════════════════════
-- STEP 8 (B5): Ensure push_subscriptions has correct columns
-- The table may already exist from 005 with the right columns.
-- We create it idempotently and do NOT add a `keys` column.
-- ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  device_info JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own push subscriptions"
    ON public.push_subscriptions FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role reads all push subscriptions"
    ON public.push_subscriptions FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- If a `keys` JSONB column was accidentally added by an earlier migration,
-- drop it so the schema matches the application code exactly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'push_subscriptions'
      AND column_name  = 'keys'
  ) THEN
    ALTER TABLE public.push_subscriptions DROP COLUMN keys;
  END IF;
END $$;


-- ════════════════════════════════════════════════════
-- STEP 9 (B7): Unified on_auth_user_created trigger
-- Drops ALL conflicting versions (from 002, 003, 004)
-- and installs a single authoritative trigger function.
-- ════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user_unified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Create user profile
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'citizen')
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent if row somehow exists

  -- 2. Write audit log
  INSERT INTO public.audit_logs (user_id, action_type, metadata)
  VALUES (
    NEW.id,
    'USER_SIGNUP',
    jsonb_build_object('email', NEW.email)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_unified();


-- ════════════════════════════════════════════════════
-- STEP 10: Missing indexes and misc cleanup
-- ════════════════════════════════════════════════════

-- alert_logs: add recipient_type if missing
ALTER TABLE public.alert_logs
  ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(20)
  CHECK (recipient_type IN ('email', 'sms', 'push', 'webhook'));

-- resources: ensure non-negative quantity
ALTER TABLE public.resources
  DROP CONSTRAINT IF EXISTS resources_quantity_check;
ALTER TABLE public.resources
  ADD CONSTRAINT resources_quantity_check CHECK (quantity >= 0);

-- Spatial index on alerts.target_zone
CREATE INDEX IF NOT EXISTS idx_alerts_zone ON public.alerts USING GIST (target_zone);


-- ════════════════════════════════════════════════════
-- STEP 11: Full RLS policy pass — coordinators / service
-- ════════════════════════════════════════════════════

-- incident_reports: coordinator scoped reads, admin reads all
DO $$ BEGIN
  CREATE POLICY "Coordinators read state reports"
    ON public.incident_reports FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'responder', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators update reports"
    ON public.incident_reports FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- events: coordinators can manage
DO $$ BEGIN
  CREATE POLICY "Service role manages events"
    ON public.events FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators manage events"
    ON public.events FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- alerts: coordinators can manage
DO $$ BEGIN
  CREATE POLICY "Service role manages alerts"
    ON public.alerts FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators manage alerts"
    ON public.alerts FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- user_profiles: service role full access
DO $$ BEGIN
  CREATE POLICY "Service role full access to user_profiles"
    ON public.user_profiles FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "All authenticated users can read profiles"
    ON public.user_profiles FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users update own profile"
    ON public.user_profiles FOR UPDATE
    USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- resources: coordinators can manage
DO $$ BEGIN
  CREATE POLICY "Service role manages resources"
    ON public.resources FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Coordinators manage resources"
    ON public.resources FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('coordinator', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- audit_logs: service role only
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service Role full access to audit_logs"
    ON public.audit_logs FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ════════════════════════════════════════════════════
-- STEP 12: Realtime publications (idempotent)
-- ════════════════════════════════════════════════════
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  EXCEPTION WHEN duplicate_object THEN null; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  EXCEPTION WHEN duplicate_object THEN null; END;
END $$;

-- ====================================================
-- END OF MIGRATION 006
-- Verification queries (run manually to confirm):
--   SELECT count(*) FROM states;               -- expect 36
--   SELECT get_state_from_point(28.61, 77.20); -- expect Delhi UUID
--   \dt public.*                               -- list all tables
-- ====================================================
