-- ============================================================================
-- Migration 016: Fix get_nearest_safe_zones resource-type filter
--
-- The function's WHERE clause searched for resource types that the API can
-- never produce, and omitted one it can:
--
--   searched but impossible : 'hospital', 'relief_camp', 'rescue'
--   creatable but omitted   : 'rescue_team', 'water'
--
-- routes/resources.js validates `type` against a Zod enum of
--   ambulance | fire_truck | helicopter | shelter | food | water | medical
--   | rescue_team | other
-- so three of the six searched values were dead predicates, while a deployed
-- rescue_team never appeared in an SOS victim's nearest-safe-zones list.
--
-- This is the list a citizen is shown immediately after raising an SOS, so the
-- mismatch silently narrowed life-safety results to shelter/medical/food only.
--
-- 'hospital' and 'relief_camp' are kept: they are not currently creatable via
-- the API but are natural safe-zone categories, so retaining them keeps the
-- function correct if the enum is widened later.
--
-- Idempotent — CREATE OR REPLACE, safe to re-run.
-- ============================================================================

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
    -- The ::TEXT casts are REQUIRED, not cosmetic: resources.name/type/status/
    -- contact/notes are VARCHAR, while RETURNS TABLE declares them TEXT. Without
    -- the casts Postgres raises "structure of query does not match function
    -- result type" at call time and the SOS safe-zone lookup fails outright.
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
    r.type IN ('shelter', 'medical', 'food', 'water', 'rescue_team', 'hospital', 'relief_camp')
    AND r.status = 'available'
    AND r.quantity > 0
  ORDER BY distance_meters ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_nearest_safe_zones(FLOAT, FLOAT, INT) TO authenticated, service_role, anon;
