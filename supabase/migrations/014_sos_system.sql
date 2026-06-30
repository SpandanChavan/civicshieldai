-- =============================================================================
-- Migration 014: SOS Emergency Request System
-- Adds: sos_requests table, emergency_contacts on user_profiles,
--       get_nearest_safe_zones function, full RLS, realtime publication
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add emergency_contacts column to user_profiles
--    Stored as a JSONB array: [{ "name": "Priya", "phone": "+919876543210" }]
--    Default is an empty array so existing rows are valid immediately.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create the sos_requests table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sos_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude          FLOAT       NOT NULL,
  longitude         FLOAT       NOT NULL,
  location          GEOGRAPHY(POINT, 4326) NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','acknowledged','resolved','cancelled')),
  message           TEXT,
  event_id          UUID        REFERENCES events(id) ON DELETE SET NULL,
  state_id          UUID        REFERENCES states(id) ON DELETE SET NULL,
  acknowledged_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  device_info       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes for performance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sos_user_id
  ON sos_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_sos_status
  ON sos_requests(status);

CREATE INDEX IF NOT EXISTS idx_sos_state_id
  ON sos_requests(state_id);

CREATE INDEX IF NOT EXISTS idx_sos_location
  ON sos_requests USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_sos_created_at
  ON sos_requests(created_at DESC);

-- Partial index: fast lookup of active requests by state (the hot path)
CREATE INDEX IF NOT EXISTS idx_sos_active_state
  ON sos_requests(state_id, created_at DESC)
  WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add sos_requests to Supabase Realtime publication
--    This allows the frontend to subscribe to DB-level changes as a fallback.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE sos_requests;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sos_requests ENABLE ROW LEVEL SECURITY;

-- Citizens: INSERT their own SOS
CREATE POLICY "Citizens can create SOS"
  ON sos_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Citizens: SELECT their own SOS (for status banner)
CREATE POLICY "Citizens can view own SOS"
  ON sos_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Citizens: UPDATE their own active SOS (only to cancel it)
CREATE POLICY "Citizens can cancel own active SOS"
  ON sos_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'active')
  WITH CHECK (auth.uid() = user_id);

-- Coordinators: SELECT SOS in their state
CREATE POLICY "Coordinators view state SOS"
  ON sos_requests FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'coordinator'
    AND state_id = (SELECT state_id FROM user_profiles WHERE id = auth.uid())
  );

-- Coordinators: UPDATE (acknowledge, resolve) SOS in their state
CREATE POLICY "Coordinators update state SOS"
  ON sos_requests FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'coordinator'
    AND state_id = (SELECT state_id FROM user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'coordinator'
  );

-- Admins: full access to all SOS
CREATE POLICY "Admins have full SOS access"
  ON sos_requests FOR ALL
  TO authenticated
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin');

-- Responders: read any SOS
CREATE POLICY "Responders read SOS"
  ON sos_requests FOR SELECT
  TO authenticated
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'responder');

-- Responders: can resolve SOS
CREATE POLICY "Responders resolve SOS"
  ON sos_requests FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'responder')
  WITH CHECK ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'responder');

-- Service role: bypass all RLS (for backend operations)
CREATE POLICY "Service role bypass SOS"
  ON sos_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grant least-privilege to roles (matches the pattern in migration 008)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON sos_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON sos_requests TO authenticated;
GRANT ALL ON sos_requests TO service_role;

-- =============================================================================
-- get_nearest_safe_zones(lat, lon, limit)
-- Returns the N nearest available resources of shelter/hospital/relief types,
-- with their straight-line distance from the caller's coordinates in meters.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_nearest_safe_zones(
  p_latitude  FLOAT,
  p_longitude FLOAT,
  p_limit     INT DEFAULT 5
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  type            TEXT,
  status          TEXT,
  quantity        INT,
  contact         TEXT,
  notes           TEXT,
  latitude        FLOAT,
  longitude       FLOAT,
  distance_meters FLOAT,
  state_id        UUID
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name::TEXT,
    r.type::TEXT,
    r.status::TEXT,
    r.quantity,
    r.contact::TEXT,
    r.notes::TEXT,
    -- Extract lat/lon back from the GEOGRAPHY column for the frontend
    ST_Y(r.location::geometry)::FLOAT  AS latitude,
    ST_X(r.location::geometry)::FLOAT  AS longitude,
    -- Haversine distance in meters using PostGIS geography type
    ST_Distance(
      r.location,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
    )::FLOAT AS distance_meters,
    r.state_id
  FROM resources r
  WHERE
    -- Include types that represent safe destinations for a citizen in distress.
    -- Add more types here as your coordinators populate more resource categories.
    r.type IN ('shelter', 'hospital', 'relief_camp', 'medical', 'food', 'rescue')
    AND r.status = 'available'
    AND r.quantity > 0
  ORDER BY distance_meters ASC
  LIMIT p_limit;
END;
$$;

-- Allow authenticated users and service_role to call this function
GRANT EXECUTE ON FUNCTION get_nearest_safe_zones(FLOAT, FLOAT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_nearest_safe_zones(FLOAT, FLOAT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_nearest_safe_zones(FLOAT, FLOAT, INT) TO anon;
