-- ====================================================
-- CivicShield AI - Supabase Database Schema
-- Run in Supabase SQL Editor (in order)
-- PREREQUISITE: Enable PostGIS extension first!
-- Dashboard > Database > Extensions > postgis > Enable
-- ====================================================

-- Verify PostGIS is enabled before running:
-- SELECT PostGIS_Version();
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── TABLE 1: events ──────────────────────────────────
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        VARCHAR(50)  NOT NULL,
  event_type    VARCHAR(50)  NOT NULL,
  severity      VARCHAR(20)  CHECK (severity IN ('Low','Medium','High','Critical')),
  title         TEXT         NOT NULL,
  description   TEXT,
  location      GEOGRAPHY(POINT, 4326),
  geojson       JSONB,
  raw_data      JSONB,
  detected_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW(),
  is_active     BOOLEAN      DEFAULT true,
  dedup_hash    VARCHAR(64)  UNIQUE
);

CREATE INDEX idx_events_location ON events USING GIST (location);
CREATE INDEX idx_events_type     ON events (event_type, severity, is_active);
CREATE INDEX idx_events_active   ON events (is_active, detected_at DESC);

-- ── TABLE 2: alerts ──────────────────────────────────
CREATE TABLE alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID         REFERENCES events(id) ON DELETE SET NULL,
  title        TEXT         NOT NULL,
  body         TEXT         NOT NULL,
  severity     VARCHAR(20),
  channels     TEXT[]       DEFAULT ARRAY['web_push'],
  target_zone  GEOGRAPHY(POLYGON, 4326),
  status       VARCHAR(20)  DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  created_by   UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_alerts_event    ON alerts (event_id);
CREATE INDEX idx_alerts_status   ON alerts (status, created_at DESC);

-- ── TABLE 3: resources ───────────────────────────────
CREATE TABLE resources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  type           VARCHAR(50)  NOT NULL,
  status         VARCHAR(30)  DEFAULT 'available' CHECK (status IN ('available','deployed','maintenance','unavailable')),
  quantity       INTEGER      DEFAULT 0,
  location       GEOGRAPHY(POINT, 4326),
  assigned_event UUID         REFERENCES events(id) ON DELETE SET NULL,
  contact        VARCHAR(200),
  notes          TEXT,
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_resources_location ON resources USING GIST (location);
CREATE INDEX idx_resources_status   ON resources (status, type);

-- ── TABLE 4: incident_reports ────────────────────────
CREATE TABLE incident_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  description  TEXT         NOT NULL,
  location     GEOGRAPHY(POINT, 4326),
  media_urls   TEXT[],
  status       VARCHAR(20)  DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','resolved')),
  event_id     UUID         REFERENCES events(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_reports_location ON incident_reports USING GIST (location);
CREATE INDEX idx_reports_status   ON incident_reports (status, created_at DESC);

-- ── TABLE 5: alert_logs ──────────────────────────────
CREATE TABLE alert_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id   UUID         REFERENCES alerts(id) ON DELETE CASCADE,
  channel    VARCHAR(50)  NOT NULL,
  recipient  TEXT,
  delivered  BOOLEAN      DEFAULT false,
  error_msg  TEXT,
  sent_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_logs_alert ON alert_logs (alert_id);

-- ── AUTO-UPDATE updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_resources_updated_at
  BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── ROW LEVEL SECURITY ───────────────────────────────
ALTER TABLE events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_logs      ENABLE ROW LEVEL SECURITY;

-- Public: read active events (civilian portal)
CREATE POLICY "Public read active events" ON events
  FOR SELECT USING (is_active = true);

-- Public: read sent alerts
CREATE POLICY "Public read sent alerts" ON alerts
  FOR SELECT USING (status = 'sent');

-- Public: read resources
CREATE POLICY "Public read resources" ON resources
  FOR SELECT USING (true);

-- Auth users: submit incident reports
CREATE POLICY "Auth users submit reports" ON incident_reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Auth users: read own incident reports
CREATE POLICY "Auth users read own reports" ON incident_reports
  FOR SELECT USING (false);

-- Service role: full access to all tables (backend uses service_role key)
-- This is automatically granted to service_role by Supabase RLS bypass

-- ── REALTIME ─────────────────────────────────────────
-- Dashboard > Database > Replication > Toggle ON: events, alerts
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
