-- ============================================================================
-- CivicShield AI — CONSOLIDATED AUTHORITATIVE SCHEMA
-- ============================================================================
-- This single file provisions a FRESH database to the exact shape the
-- application code expects. It is the squashed equivalent of migrations
-- 001 → 007 and is the recommended path for new environments.
--
-- PREREQUISITE: enable the PostGIS extension (handled below).
-- Fully idempotent — safe to re-run.
--
-- For an existing database, keep applying the numbered migrations instead.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ── shared trigger fn: keep updated_at fresh ────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE: states  (referenced by almost everything → created first)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  code        CHAR(2)      NOT NULL UNIQUE,
  capital     VARCHAR(100),
  bbox_north  DECIMAL(10,7),
  bbox_south  DECIMAL(10,7),
  bbox_east   DECIMAL(10,7),
  bbox_west   DECIMAL(10,7),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  drift_test  TEXT
);
CREATE INDEX IF NOT EXISTS idx_states_code ON public.states (code);

INSERT INTO public.states (name, code, capital, bbox_north, bbox_south, bbox_east, bbox_west) VALUES
  ('Andhra Pradesh','AP','Amaravati',19.1668060,12.6238599,84.7658033,76.7600837),
  ('Arunachal Pradesh','AR','Itanagar',29.3745566,26.6508630,97.3950905,91.5623082),
  ('Assam','AS','Dispur',27.9712428,24.1360330,96.0124397,89.6986005),
  ('Bihar','BR','Patna',27.5216350,24.2857164,88.2937958,83.3212566),
  ('Chhattisgarh','CG','Raipur',24.1066864,17.7822157,84.3959641,80.2441803),
  ('Goa','GA','Panaji',15.8007631,14.7529315,74.3361139,73.6756012),
  ('Gujarat','GJ','Gandhinagar',24.7118932,20.1195321,74.4764325,68.1756585),
  ('Haryana','HR','Chandigarh',30.9287706,27.6526273,77.6021432,74.4735074),
  ('Himachal Pradesh','HP','Shimla',33.2556686,30.3771701,79.0123843,75.5940055),
  ('Jharkhand','JH','Ranchi',25.3489225,21.9700317,87.9628253,83.3281137),
  ('Karnataka','KA','Bengaluru',18.4766494,11.5945587,78.5875761,74.0543908),
  ('Kerala','KL','Thiruvananthapuram',12.7960559,8.2935318,77.4123612,74.8640682),
  ('Madhya Pradesh','MP','Bhopal',26.8695616,21.0706885,82.8126116,74.0293820),
  ('Maharashtra','MH','Mumbai',22.0302694,15.6063596,80.8977842,72.6526112),
  ('Manipur','MN','Imphal',25.6921015,23.8336205,94.7452440,92.9707074),
  ('Meghalaya','ML','Shillong',26.1181651,25.0306475,92.8027367,89.8144440),
  ('Mizoram','MZ','Aizawl',24.5231304,21.9400528,93.4373696,92.2602224),
  ('Nagaland','NL','Kohima',27.0358010,25.1984274,95.2423775,93.3267005),
  ('Odisha','OR','Bhubaneswar',22.5675932,17.8122733,87.4861351,81.3885855),
  ('Punjab','PB','Chandigarh',32.5111793,29.5429378,76.9390583,73.8798336),
  ('Rajasthan','RJ','Jaipur',30.1982530,23.0586612,78.2720089,69.4844368),
  ('Sikkim','SK','Gangtok',28.1240465,27.0792596,88.9211683,88.0120333),
  ('Tamil Nadu','TN','Chennai',13.5639111,8.0768938,80.3592991,76.2329467),
  ('Telangana','TG','Hyderabad',19.9172962,15.8364246,81.3226246,77.2365850),
  ('Tripura','TR','Agartala',24.5308780,22.9376106,92.3358500,91.1508098),
  ('Uttar Pradesh','UP','Lucknow',30.4063828,23.8706272,84.6345091,77.0838761),
  ('Uttarakhand','UK','Dehradun',31.4590160,28.7243243,81.0447890,77.5713300),
  ('West Bengal','WB','Kolkata',27.2210674,21.5473014,89.8826022,85.8196735),
  ('Andaman and Nicobar Islands','AN','Port Blair',13.6753133,6.7562674,94.2773214,92.2042072),
  ('Chandigarh','CH','Chandigarh',30.7949512,30.6649740,76.8490280,76.7049857),
  ('Dadra and Nagar Haveli and Daman and Diu','DN','Daman',20.7677936,20.0473907,73.2178258,70.8734588),
  ('Delhi','DL','New Delhi',28.8834000,28.4041000,77.3467000,76.8374000),
  ('Jammu and Kashmir','JK','Srinagar',34.7871414,32.2763569,76.7803165,73.7500338),
  ('Ladakh','LA','Leh',35.6729307,32.3357400,79.4607280,75.3269726),
  ('Lakshadweep','LD','Kavaratti',12.6010064,8.0648198,73.9061436,71.5180377),
  ('Puducherry','PY','Puducherry',16.7617112,10.8277210,82.3137136,75.5265863)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- FUNCTION: get_state_from_point(lat, lon) → state UUID (smallest bbox match)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_state_from_point(lat FLOAT, lon FLOAT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE matched_id UUID;
BEGIN
  SELECT id INTO matched_id
  FROM public.states
  WHERE lat BETWEEN bbox_south AND bbox_north
    AND lon BETWEEN bbox_west  AND bbox_east
  ORDER BY (bbox_north - bbox_south) * (bbox_east - bbox_west) ASC
  LIMIT 1;
  RETURN matched_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_state_from_point(FLOAT, FLOAT) TO anon, authenticated, service_role;

-- ============================================================================
-- TABLE: events
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      VARCHAR(50)  NOT NULL,
  event_type  VARCHAR(50)  NOT NULL,
  severity    VARCHAR(20)  CHECK (severity IN ('Low','Medium','High','Critical')),
  title       TEXT         NOT NULL,
  description TEXT,
  location    GEOGRAPHY(POINT, 4326),
  geojson     JSONB,
  raw_data    JSONB,
  detected_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW(),
  is_active   BOOLEAN      DEFAULT true,
  dedup_hash  VARCHAR(64)  UNIQUE,
  state_id    UUID         REFERENCES public.states(id)   ON DELETE SET NULL,
  created_by  UUID         REFERENCES auth.users(id)      ON DELETE SET NULL,
  alerted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_events_location  ON public.events USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_events_type      ON public.events (event_type, severity, is_active);
CREATE INDEX IF NOT EXISTS idx_events_active     ON public.events (is_active, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_state      ON public.events (state_id);
CREATE INDEX IF NOT EXISTS idx_events_unalerted  ON public.events (severity) WHERE alerted_at IS NULL;

DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- TABLE: alerts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID         REFERENCES public.events(id) ON DELETE SET NULL,
  title       TEXT         NOT NULL,
  body        TEXT         NOT NULL,
  severity    VARCHAR(20),
  channels    TEXT[]       DEFAULT ARRAY['web_push'],
  target_zone GEOGRAPHY(POLYGON, 4326),
  status      VARCHAR(20)  DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  created_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  state_id    UUID         REFERENCES public.states(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_event  ON public.alerts (event_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_state  ON public.alerts (state_id);
CREATE INDEX IF NOT EXISTS idx_alerts_zone   ON public.alerts USING GIST (target_zone);

-- ============================================================================
-- TABLE: resources
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.resources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  type           VARCHAR(50)  NOT NULL,
  status         VARCHAR(30)  DEFAULT 'available' CHECK (status IN ('available','deployed','maintenance','unavailable')),
  quantity       INTEGER      DEFAULT 0 CHECK (quantity >= 0),
  location       GEOGRAPHY(POINT, 4326),
  assigned_event UUID         REFERENCES public.events(id) ON DELETE SET NULL,
  contact        VARCHAR(200),
  notes          TEXT,
  updated_at     TIMESTAMPTZ  DEFAULT NOW(),
  state_id       UUID         REFERENCES public.states(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_location ON public.resources USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_resources_status   ON public.resources (status, type);
CREATE INDEX IF NOT EXISTS idx_resources_state    ON public.resources (state_id);

DROP TRIGGER IF EXISTS trg_resources_updated_at ON public.resources;
CREATE TRIGGER trg_resources_updated_at BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- TABLE: incident_reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID         REFERENCES auth.users(id)    ON DELETE SET NULL,
  description      TEXT         NOT NULL,
  location         GEOGRAPHY(POINT, 4326),
  media_urls       TEXT[],
  status           VARCHAR(20)  DEFAULT 'pending_review'
                     CHECK (status IN ('pending_review','under_review','approved','rejected','resolved')),
  event_id         UUID         REFERENCES public.events(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  state_id         UUID         REFERENCES public.states(id) ON DELETE SET NULL,
  reviewer_id      UUID         REFERENCES auth.users(id)    ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  category         VARCHAR(50)  CHECK (category IN (
                     'flood','fire','earthquake_damage','missing_person','road_blockage',
                     'medical_emergency','infrastructure_damage','landslide','cyclone','heatwave','other')),
  title            VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS idx_reports_location ON public.incident_reports USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON public.incident_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_state    ON public.incident_reports (state_id);
CREATE INDEX IF NOT EXISTS idx_reports_category ON public.incident_reports (category, status, created_at DESC);

-- ============================================================================
-- TABLE: alert_logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alert_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id       UUID         REFERENCES public.alerts(id) ON DELETE CASCADE,
  channel        VARCHAR(50)  NOT NULL,
  recipient      TEXT,
  delivered      BOOLEAN      DEFAULT false,
  error_msg      TEXT,
  sent_at        TIMESTAMPTZ  DEFAULT NOW(),
  recipient_type VARCHAR(20)  CHECK (recipient_type IN ('email','sms','push','webhook'))
);
CREATE INDEX IF NOT EXISTS idx_logs_alert ON public.alert_logs (alert_id);

-- ============================================================================
-- TABLE: user_profiles  (+ signup trigger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        VARCHAR(20) DEFAULT 'citizen' CHECK (role IN ('citizen','coordinator','responder','admin')),
  full_name   TEXT,
  state_id    UUID REFERENCES public.states(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_state ON public.user_profiles (state_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role  ON public.user_profiles (role);

-- ============================================================================
-- TABLE: audit_logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  action_type TEXT NOT NULL,
  entity_id   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON public.audit_logs (created_at DESC);

-- ============================================================================
-- TABLE: misinformation_checks
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.misinformation_checks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text        TEXT        NOT NULL,
  credibility_score INTEGER     NOT NULL CHECK (credibility_score BETWEEN 0 AND 100),
  classification    TEXT        NOT NULL,
  confidence        INTEGER     NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  is_misinformation BOOLEAN     NOT NULL DEFAULT false,
  explanation       TEXT,
  report_id         UUID        REFERENCES public.incident_reports(id) ON DELETE SET NULL,
  analyzed_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_misinfo_report   ON public.misinformation_checks (report_id);
CREATE INDEX IF NOT EXISTS idx_misinfo_analyzed ON public.misinformation_checks (analyzed_at DESC);

-- ============================================================================
-- TABLE: push_subscriptions
-- ============================================================================
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

-- ============================================================================
-- SIGNUP TRIGGER: create profile + audit log on new auth user
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_unified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name',
          COALESCE(NEW.raw_user_meta_data->>'role', 'citizen'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action_type, metadata)
  VALUES (NEW.id, 'USER_SIGNUP', jsonb_build_object('email', NEW.email));

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_unified();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.misinformation_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions    ENABLE ROW LEVEL SECURITY;

-- Helper to (re)create a policy idempotently
-- (Postgres has no CREATE POLICY IF NOT EXISTS; guard with exception blocks.)

-- Public read of safe data
DO $$ BEGIN CREATE POLICY "Public read active events" ON public.events FOR SELECT USING (is_active = true);            EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Public read sent alerts"    ON public.alerts FOR SELECT USING (status = 'sent');            EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Public read resources"      ON public.resources FOR SELECT USING (true);                   EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Public read states"         ON public.states FOR SELECT USING (true);                      EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Service role full access (backend uses the service-role key)
DO $$ BEGIN CREATE POLICY "Service role manages events"    ON public.events    FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role manages alerts"    ON public.alerts    FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role manages resources" ON public.resources FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role manages states"    ON public.states    FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role full access to user_profiles"         ON public.user_profiles         FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service Role full access to audit_logs"            ON public.audit_logs            FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role full access to misinformation_checks" ON public.misinformation_checks FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service Role full access to alert_logs"            ON public.alert_logs            FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role full access to incident_reports"      ON public.incident_reports      FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Coordinators / admins manage operational data
DO $$ BEGIN CREATE POLICY "Coordinators manage events"    ON public.events    FOR ALL USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('coordinator','admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Coordinators manage alerts"    ON public.alerts    FOR ALL USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('coordinator','admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Coordinators manage resources" ON public.resources FOR ALL USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('coordinator','admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- incident_reports: submit (auth), read own, responders/coordinators read, coordinators update
DO $$ BEGIN CREATE POLICY "Auth users submit reports"   ON public.incident_reports FOR INSERT WITH CHECK (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Auth users read own reports" ON public.incident_reports FOR SELECT USING (reporter_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Responders read all reports" ON public.incident_reports FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('coordinator','responder','admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Coordinators update reports"  ON public.incident_reports FOR UPDATE USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('coordinator','admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- user_profiles
DO $$ BEGIN CREATE POLICY "All authenticated users can read profiles" ON public.user_profiles FOR SELECT USING (auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users update own profile"                  ON public.user_profiles FOR UPDATE USING (id = auth.uid());                EXCEPTION WHEN duplicate_object THEN null; END $$;

-- misinformation_checks: coordinators read
DO $$ BEGIN CREATE POLICY "Coordinators read misinformation checks" ON public.misinformation_checks FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('coordinator','admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- push_subscriptions
DO $$ BEGIN CREATE POLICY "Users manage own push subscriptions"     ON public.push_subscriptions FOR ALL    USING (user_id = auth.uid());           EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role manages push subscriptions" ON public.push_subscriptions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- REALTIME
-- ============================================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.events; EXCEPTION WHEN duplicate_object THEN null; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts; EXCEPTION WHEN duplicate_object THEN null; END;
END $$;

-- ============================================================================
-- VERIFY (run manually):
--   SELECT count(*) FROM states;                 -- expect 36
--   SELECT get_state_from_point(28.61, 77.20);   -- expect Delhi UUID
--   SELECT get_state_from_point(0, 0);           -- expect NULL
-- ============================================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
