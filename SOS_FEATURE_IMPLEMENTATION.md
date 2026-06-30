# One-Tap SOS + Smart Nearest Safe Zone Finder
## Complete Engineer Implementation Guide — CivicShield AI

> **Purpose:** This document is the single source of truth for implementing the SOS feature end-to-end.
> Follow every step in the exact order listed. Do not skip any step. Each section tells you which file to
> create or modify and provides the complete code. All code is written specifically for the CivicShield AI
> stack (Node/Express, FastAPI, React/Vite, Supabase/PostGIS, Socket.io, Twilio, Zustand).

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Full Architecture & Data Flow](#2-full-architecture--data-flow)
3. [Pre-Implementation Checklist](#3-pre-implementation-checklist)
4. [Step 1 — Database Migration (010)](#4-step-1--database-migration-010)
5. [Step 2 — PostGIS Helper Function](#5-step-2--postgis-helper-function)
6. [Step 3 — Backend: SOS Route File](#6-step-3--backend-sos-route-file)
7. [Step 4 — Backend: Mount Route in app.js](#7-step-4--backend-mount-route-in-appjs)
8. [Step 5 — Backend: Socket.io User Rooms](#8-step-5--backend-socketio-user-rooms)
9. [Step 6 — Backend: Extend notificationRouter](#9-step-6--backend-extend-notificationrouter)
10. [Step 7 — Frontend: backendApi.js additions](#10-step-7--frontend-backendapijs-additions)
11. [Step 8 — Frontend: Zustand store updates](#11-step-8--frontend-zustand-store-updates)
12. [Step 9 — Frontend: SOSButton component](#12-step-9--frontend-sosbutton-component)
13. [Step 10 — Frontend: NearestSafeZones component](#13-step-10--frontend-nearestsafezones-component)
14. [Step 11 — Frontend: SOSStatusBanner component](#14-step-11--frontend-sosstatusbanner-component)
15. [Step 12 — Frontend: EmergencyContacts in Profile](#15-step-12--frontend-emergencycontacts-in-profile)
16. [Step 13 — Frontend: Update CitizenPortal page](#16-step-13--frontend-update-citizenportal-page)
17. [Step 14 — Frontend: CoordinatorDashboard SOS Panel](#17-step-14--frontend-coordinatordashboard-sos-panel)
18. [Step 15 — schema.sql sync](#18-step-15--schemasql-sync)
19. [Step 16 — Environment Variables](#19-step-16--environment-variables)
20. [Step 17 — Testing Guide](#20-step-17--testing-guide)
21. [Known Limitations & Future Work](#21-known-limitations--future-work)

---

## 1. Feature Overview

### What it does
A citizen in distress opens CivicShield AI and taps a single red SOS button. The following happen simultaneously within 3 seconds:

1. Their GPS coordinates are captured via browser Geolocation API.
2. An `sos_requests` row is inserted in the database with `status = 'active'`.
3. A Socket.io event `sos:new` is emitted to every coordinator/responder/admin in that state's room.
4. SMS alerts are sent via Twilio to the citizen's pre-saved emergency contacts with a Google Maps link.
5. The citizen immediately sees the 5 nearest available shelters, hospitals, and relief camps with distances.
6. A live status banner shows: Waiting for acknowledgement → Acknowledged → Resolved.

On the coordinator side:
- A real-time SOS alert panel shows all active SOS requests in their state.
- They click "Acknowledge" and dispatch help. The citizen's app banner updates live.
- Once resolved, both sides see the closed status.

### User roles involved

| Role | What they do |
|------|-------------|
| Citizen | Creates SOS, sees nearest safe zones, sees live status |
| Coordinator | Sees SOS panel, acknowledges, resolves |
| Admin | Sees all SOS requests across all states |
| Responder | Reads SOS, can resolve |

---

## 2. Full Architecture & Data Flow

```
CITIZEN (Browser)
  │
  │  1. Tap SOS button
  │  2. Browser Geolocation API → lat/lon
  │  3. POST /api/sos  {latitude, longitude}
  │
  ▼
BACKEND (Express)  ←  JWT from Supabase Auth
  │
  ├─ Validate with Zod
  ├─ get_state_from_point RPC → state_id
  ├─ INSERT sos_requests (status=active)
  ├─ get_nearest_safe_zones RPC → 5 resources
  ├─ Fetch user_profiles → emergency_contacts
  ├─ Twilio SMS → each emergency contact
  │
  ├─ io.to('state:<id>').emit('sos:new', payload)     → COORDINATOR browser
  ├─ io.to('role:admin').emit('sos:new', payload)     → ADMIN browser
  │
  └─ Response: { sos, nearest_safe_zones }            → CITIZEN browser
        │
        ▼
  CITIZEN sees NearestSafeZones + SOSStatusBanner

COORDINATOR (Browser)
  │  Socket.io 'sos:new' event arrives
  │
  ├─ SOSAlertPanel shows new card with citizen location + message
  ├─ Coordinator clicks Acknowledge
  │    PATCH /api/sos/:id/acknowledge
  │       → UPDATE sos_requests status='acknowledged'
  │       → io.to('user:<citizen_id>').emit('sos:acknowledged')
  │
  └─ SOSStatusBanner on citizen app updates to "Help is coming"

  Later: PATCH /api/sos/:id/resolve
       → io.to('user:<citizen_id>').emit('sos:resolved')
       → SOSStatusBanner shows "Resolved"
```

---

## 3. Pre-Implementation Checklist

Before writing a single line of code, verify the following:

- [ ] Twilio account is active and `TWILIO_SMS_NUMBER` env var is set in `backend/.env`
- [ ] The existing `resources` table has resource entries with `type = 'shelter'` or `'hospital'` or `'relief_camp'` — if not, seed some test entries manually in Supabase before testing this feature
- [ ] You know your current highest migration number — this guide adds migration `010`. Adjust the filename if yours is already past 009.
- [ ] The existing `get_state_from_point(lat, lon)` RPC function works in your DB — test it in the Supabase SQL editor with a known coordinate before proceeding.
- [ ] PostGIS extension is enabled in your Supabase project (it should be, per migration 001).
- [ ] Socket.io server is running and rooms `role:coordinator`, `role:admin`, `state:<id>` are being joined correctly on connection (verify in `app.js`).

---

## 4. Step 1 — Database Migration (010)

**File to create:** `supabase/migrations/010_sos_system.sql`

Create this file exactly as shown below. Do not run it manually yet — your CI pipeline applies it automatically on the local Supabase stack. For production, follow your `DEPLOY_CHECKLIST.md`.

```sql
-- =============================================================================
-- Migration 010: SOS Emergency Request System
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
```

---

## 5. Step 2 — PostGIS Helper Function

**File to create:** `supabase/migrations/010b_sos_helper_function.sql`

> **Note:** Keep this as a separate file for clarity, or append it to `010_sos_system.sql` after the GRANT statements. Either way is fine — just be consistent with your migration naming.

```sql
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
    r.name,
    r.type,
    r.status,
    r.quantity,
    r.contact,
    r.notes,
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
```

**Test this function** in the Supabase SQL editor before moving on:
```sql
-- Should return rows if you have resources of the right type in the DB
SELECT * FROM get_nearest_safe_zones(18.5204, 73.8567, 5);
-- 18.5204, 73.8567 = Pune, Maharashtra
```

---

## 6. Step 3 — Backend: SOS Route File

**File to create:** `backend/src/routes/sos.js`

This is a new file. Create it from scratch.

```javascript
/**
 * backend/src/routes/sos.js
 *
 * SOS Emergency Routes
 *
 * POST   /api/sos                     — Create SOS (authenticated citizen)
 * GET    /api/sos                     — List SOS requests (coordinator/admin/responder)
 * GET    /api/sos/mine                — Citizen views their own SOS history
 * GET    /api/sos/nearest-safe-zones  — Nearest available resources for a lat/lon
 * GET    /api/sos/:id                 — Get a single SOS request
 * PATCH  /api/sos/:id/acknowledge     — Coordinator acknowledges SOS
 * PATCH  /api/sos/:id/resolve         — Mark SOS as resolved
 * PATCH  /api/sos/:id/cancel          — Citizen cancels their own active SOS
 */

const express = require('express');
const { z } = require('zod');
const { getAdminDb } = require('../lib/db');
const { auditLog } = require('../utils/auditLogger');
const notificationRouter = require('../services/notificationRouter');

const router = express.Router();

// ─── Zod validation schemas ───────────────────────────────────────────────────

const createSosSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  message:   z.string().max(500).optional(),
  event_id:  z.string().uuid().optional(),
});

const acknowledgeSchema = z.object({
  eta_minutes: z.number().int().min(1).max(300).optional(),
  note:        z.string().max(500).optional(),
});

// ─── Helper: validate request body with Zod ──────────────────────────────────

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

// ─── POST /api/sos ────────────────────────────────────────────────────────────
// Creates an SOS request. Requires authentication (any role).
// Emits Socket.io event to state room and sends SMS to emergency contacts.

router.post('/', validate(createSosSchema), async (req, res, next) => {
  try {
    // Must be logged in
    if (!req.userId) {
      return res.status(401).json({ error: 'You must be logged in to send an SOS.' });
    }

    const { latitude, longitude, message, event_id } = req.body;
    const db = getAdminDb();

    // ── 1. Check for already-active SOS from this user ──────────────────────
    const { data: existingSos } = await db
      .from('sos_requests')
      .select('id')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSos) {
      return res.status(409).json({
        error: 'You already have an active SOS request. Cancel it before creating a new one.',
        existing_id: existingSos.id,
      });
    }

    // ── 2. Resolve state_id from coordinates ─────────────────────────────────
    // Uses the existing get_state_from_point RPC (defined in migration 006).
    const { data: stateId, error: rpcError } = await db.rpc('get_state_from_point', {
      lat: latitude,
      lon: longitude,
    });

    if (rpcError) {
      console.error('[SOS] get_state_from_point RPC error:', rpcError.message);
      // Do NOT abort — state_id being null is acceptable; SOS still goes through.
    }

    // ── 3. Build PostGIS WKT point string ────────────────────────────────────
    // Format: SRID=4326;POINT(longitude latitude) — note lon first, then lat.
    const locationWkt = `SRID=4326;POINT(${longitude} ${latitude})`;

    // ── 4. Insert SOS request ────────────────────────────────────────────────
    const { data: sos, error: insertError } = await db
      .from('sos_requests')
      .insert({
        user_id:     req.userId,
        latitude,
        longitude,
        location:    locationWkt,
        message:     message || null,
        event_id:    event_id || null,
        state_id:    stateId || null,
        status:      'active',
        device_info: {
          user_agent: req.headers['user-agent'] || null,
          created_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // ── 5. Audit log ─────────────────────────────────────────────────────────
    await auditLog(req.userId, 'SOS_CREATED', sos.id, {
      latitude,
      longitude,
      state_id: stateId,
    });

    // ── 6. Fetch user profile for name and emergency contacts ─────────────────
    const { data: profile } = await db
      .from('user_profiles')
      .select('full_name, emergency_contacts')
      .eq('id', req.userId)
      .maybeSingle();

    // ── 7. Fetch user email from Supabase Auth ────────────────────────────────
    let userEmail = null;
    try {
      const { data: authData } = await db.auth.admin.getUserById(req.userId);
      userEmail = authData?.user?.email || null;
    } catch (authErr) {
      console.error('[SOS] Could not fetch user email:', authErr.message);
    }

    // ── 8. Emit Socket.io events to coordinator and admin rooms ──────────────
    // req.io is attached to every request in app.js (see Step 4).
    const sosPayload = {
      id:         sos.id,
      user_id:    req.userId,
      full_name:  profile?.full_name || userEmail || 'Unknown',
      latitude,
      longitude,
      message:    message || null,
      state_id:   stateId || null,
      created_at: sos.created_at,
    };

    if (req.io) {
      if (stateId) {
        req.io.to(`state:${stateId}`).emit('sos:new', sosPayload);
      }
      req.io.to('role:admin').emit('sos:new', sosPayload);
      req.io.to('role:responder').emit('sos:new', sosPayload);
    } else {
      console.warn('[SOS] req.io not available — Socket.io event not emitted');
    }

    // ── 9. Send SMS to emergency contacts ────────────────────────────────────
    const emergencyContacts = Array.isArray(profile?.emergency_contacts)
      ? profile.emergency_contacts
      : [];

    if (emergencyContacts.length > 0) {
      const mapsLink  = `https://maps.google.com/?q=${latitude},${longitude}`;
      const senderName = profile?.full_name || userEmail || 'Someone';
      const smsBody   = [
        `🚨 EMERGENCY SOS from ${senderName}`,
        `They need immediate help at:`,
        mapsLink,
        message ? `Their message: "${message}"` : '',
        `Alert sent via CivicShield AI — India Disaster Response Platform`,
      ].filter(Boolean).join('\n');

      for (const contact of emergencyContacts) {
        if (contact.phone) {
          try {
            await notificationRouter.routeAlert(
              { title: `SOS from ${senderName}`, body: smsBody },
              ['sms'],
              [contact.phone]
            );
          } catch (smsErr) {
            // Log but do not fail the whole SOS creation
            console.error(`[SOS] SMS to ${contact.phone} failed:`, smsErr.message);
          }
        }
      }
    }

    // ── 10. Fetch nearest safe zones to return in the response ───────────────
    const { data: nearestZones, error: zonesError } = await db.rpc('get_nearest_safe_zones', {
      p_latitude:  latitude,
      p_longitude: longitude,
      p_limit:     5,
    });

    if (zonesError) {
      console.error('[SOS] get_nearest_safe_zones error:', zonesError.message);
    }

    // ── 11. Respond ──────────────────────────────────────────────────────────
    return res.status(201).json({
      success:           true,
      sos,
      nearest_safe_zones: nearestZones || [],
    });

  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos ─────────────────────────────────────────────────────────────
// Lists SOS requests. Coordinators see their state only; admins see all.
// Query params: status (active|acknowledged|resolved|cancelled|all), limit, offset

router.get('/', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowedRoles = ['coordinator', 'admin', 'responder'];
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const db     = getAdminDb();
    const status = req.query.status || 'active';
    const limit  = Math.min(parseInt(req.query.limit || '50'), 100);
    const offset = parseInt(req.query.offset || '0');

    let query = db
      .from('sos_requests')
      .select(`
        id, user_id, latitude, longitude, message, status, state_id,
        acknowledged_by, acknowledged_at, resolved_at, cancelled_at, created_at,
        user_profiles!sos_requests_user_id_fkey ( full_name ),
        states ( name, code )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Scope coordinators to their own state
    if (req.userRole === 'coordinator' && req.userStateId) {
      query = query.eq('state_id', req.userStateId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ sos_requests: data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos/mine ────────────────────────────────────────────────────────
// Citizen fetches their own SOS history (for status banner + history page).
// IMPORTANT: This route must be declared BEFORE /:id to avoid "mine" being
// interpreted as a UUID parameter.

router.get('/mine', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getAdminDb();
    const { data, error } = await db
      .from('sos_requests')
      .select('id, status, latitude, longitude, message, state_id, created_at, acknowledged_at, resolved_at, states(name)')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return res.json({ sos_requests: data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos/nearest-safe-zones ─────────────────────────────────────────
// Returns nearest available resources for a given lat/lon.
// Public endpoint (no auth required) so it works even before SOS submission.
// Query params: lat, lon, limit (default 5)

router.get('/nearest-safe-zones', async (req, res, next) => {
  try {
    const { lat, lon, limit } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Both lat and lon query parameters are required.' });
    }

    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'lat and lon must be valid decimal numbers.' });
    }
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({ error: 'lat must be between -90 and 90.' });
    }
    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'lon must be between -180 and 180.' });
    }

    const db = getAdminDb();
    const { data, error } = await db.rpc('get_nearest_safe_zones', {
      p_latitude:  latitude,
      p_longitude: longitude,
      p_limit:     Math.min(parseInt(limit || '5'), 20),
    });

    if (error) throw error;

    return res.json({ safe_zones: data || [] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sos/:id ─────────────────────────────────────────────────────────
// Fetches a single SOS request. Access: owner, coordinator of that state, admin, responder.

router.get('/:id', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getAdminDb();
    const { data, error } = await db
      .from('sos_requests')
      .select(`
        *,
        user_profiles!sos_requests_user_id_fkey ( full_name ),
        states ( name, code )
      `)
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'SOS request not found.' });

    const isOwner      = data.user_id === req.userId;
    const isCoordinator = req.userRole === 'coordinator' && data.state_id === req.userStateId;
    const isAdmin      = req.userRole === 'admin';
    const isResponder  = req.userRole === 'responder';

    if (!isOwner && !isCoordinator && !isAdmin && !isResponder) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return res.json({ sos: data });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sos/:id/acknowledge ──────────────────────────────────────────
// Coordinator/admin/responder acknowledges an active SOS.
// Notifies the citizen via Socket.io.

router.patch('/:id/acknowledge', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowed = ['coordinator', 'admin', 'responder'];
    if (!allowed.includes(req.userRole)) {
      return res.status(403).json({ error: 'Only coordinators, admins, or responders can acknowledge SOS.' });
    }

    // Validate body (optional fields)
    const parsed = acknowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten().fieldErrors });
    }

    const { eta_minutes, note } = parsed.data;
    const db = getAdminDb();

    // Fetch current SOS to check status and get citizen's user_id
    const { data: existing, error: fetchErr } = await db
      .from('sos_requests')
      .select('id, status, user_id, state_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'SOS request not found.' });
    if (existing.status !== 'active') {
      return res.status(400).json({
        error: `Cannot acknowledge SOS with status "${existing.status}". Only active SOS can be acknowledged.`,
      });
    }

    // Update the SOS
    const { data: updated, error: updateErr } = await db
      .from('sos_requests')
      .update({
        status:          'acknowledged',
        acknowledged_by: req.userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    await auditLog(req.userId, 'SOS_ACKNOWLEDGED', req.params.id, { eta_minutes, note });

    // Notify the citizen via their personal Socket.io room
    if (req.io) {
      req.io.to(`user:${existing.user_id}`).emit('sos:acknowledged', {
        id:              req.params.id,
        acknowledged_by: req.userId,
        eta_minutes:     eta_minutes || null,
        note:            note || null,
        acknowledged_at: updated.acknowledged_at,
      });
    }

    return res.json({ success: true, sos: updated });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sos/:id/resolve ───────────────────────────────────────────────
// Marks an active or acknowledged SOS as resolved.

router.patch('/:id/resolve', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowed = ['coordinator', 'admin', 'responder'];
    if (!allowed.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    const db = getAdminDb();

    // Only transition from active or acknowledged → resolved
    const { data: updated, error } = await db
      .from('sos_requests')
      .update({
        status:      'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .in('status', ['active', 'acknowledged'])
      .select()
      .single();

    if (error) throw error;
    if (!updated) {
      return res.status(404).json({ error: 'SOS not found or already resolved/cancelled.' });
    }

    await auditLog(req.userId, 'SOS_RESOLVED', req.params.id, {});

    if (req.io) {
      req.io.to(`user:${updated.user_id}`).emit('sos:resolved', { id: req.params.id });
      if (updated.state_id) {
        req.io.to(`state:${updated.state_id}`).emit('sos:status_changed', {
          id: req.params.id,
          status: 'resolved',
        });
      }
    }

    return res.json({ success: true, sos: updated });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sos/:id/cancel ────────────────────────────────────────────────
// Citizen cancels their own active SOS (e.g. false alarm).

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getAdminDb();

    const { data: updated, error } = await db
      .from('sos_requests')
      .update({
        status:       'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)   // Ensure only the owner can cancel
      .eq('status', 'active')      // Can only cancel active SOS
      .select()
      .single();

    if (error) throw error;
    if (!updated) {
      return res.status(404).json({
        error: 'SOS not found, already resolved, or you are not the owner.',
      });
    }

    await auditLog(req.userId, 'SOS_CANCELLED', req.params.id, {});

    if (req.io) {
      if (updated.state_id) {
        req.io.to(`state:${updated.state_id}`).emit('sos:status_changed', {
          id: req.params.id,
          status: 'cancelled',
        });
      }
      req.io.to('role:admin').emit('sos:status_changed', {
        id: req.params.id,
        status: 'cancelled',
      });
    }

    return res.json({ success: true, sos: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

---

## 7. Step 4 — Backend: Mount Route in app.js

**File to modify:** `backend/src/app.js`

Find the block where existing routes are mounted. It looks like this:

```javascript
// EXISTING — do not change these lines
app.use('/api/events',      require('./routes/events'));
app.use('/api/alerts',      require('./routes/alerts'));
app.use('/api/resources',   require('./routes/resources'));
app.use('/api/incidents',   require('./routes/incidents'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/states',      require('./routes/states'));
app.use('/api/admin',       require('./routes/admin'));
```

Add the SOS route immediately after the last `app.use` line above:

```javascript
// ADD THIS LINE — SOS emergency system
app.use('/api/sos', require('./routes/sos'));
```

Next, find the line where your Express app creates the HTTP server and passes it to Socket.io. It will look something like:

```javascript
const httpServer = createServer(app);
const io = new Server(httpServer, { ... });
```

After `io` is initialized but before `httpServer.listen(...)`, find the Socket.io connection handler. It currently does something like:

```javascript
io.on('connection', (socket) => {
  socket.join('public');
  if (socket.data.role) socket.join(`role:${socket.data.role}`);
  if (socket.data.stateId) socket.join(`state:${socket.data.stateId}`);
  // ...
});
```

Add the personal user room join inside that same `io.on('connection', ...)` block:

```javascript
io.on('connection', (socket) => {
  socket.join('public');
  if (socket.data.role)    socket.join(`role:${socket.data.role}`);
  if (socket.data.stateId) socket.join(`state:${socket.data.stateId}`);

  // ── ADD THIS: personal user room for SOS acknowledgement notifications ──
  if (socket.data.userId) {
    socket.join(`user:${socket.data.userId}`);
  }
  // ── END ADD ──

  socket.on('disconnect', () => {
    // existing disconnect logic
  });
});
```

Finally, attach `io` to every request so routes can call `req.io`. Add this middleware immediately after `app.use(stateScope)` (or wherever your stateScope middleware is mounted):

```javascript
// ADD: attach Socket.io instance to every request so routes can emit events
app.use((req, _res, next) => {
  req.io = io;
  next();
});
```

> **Where exactly:** This `app.use` must come AFTER `io` is defined but BEFORE the route registrations. If `io` is defined after the routes in your current file, refactor so `io` is created before the routes. The standard pattern in Node is: create server → create io → attach middleware → mount routes → listen.

---

## 8. Step 5 — Backend: Socket.io User Rooms

**File to check:** `backend/src/app.js` — the JWT handshake section.

Your current Socket.io JWT handshake verifies the token and sets `socket.data.role` and `socket.data.stateId`. Make sure `socket.data.userId` is also being set. Find the handshake middleware:

```javascript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));

  try {
    const { data: { user }, error } = await getAnonDb().auth.getUser(token);
    if (error || !user) return next(new Error('Invalid token'));

    const { data: profile } = await getAdminDb()
      .from('user_profiles')
      .select('role, state_id')
      .eq('id', user.id)
      .single();

    socket.data.userId  = user.id;           // ← Make sure this line exists
    socket.data.role    = profile?.role;
    socket.data.stateId = profile?.state_id;
    next();
  } catch (err) {
    next(new Error('Auth failed'));
  }
});
```

If `socket.data.userId = user.id` is missing, add it. This is what powers the `user:<id>` personal room.

---

## 9. Step 6 — Backend: Extend notificationRouter

**File to check:** `backend/src/services/notificationRouter.js`

The existing `routeAlert(alert, channels, recipients)` function already handles SMS via Twilio. Verify it accepts an array of phone numbers as `recipients` when channel is `'sms'`. If it currently only accepts a single recipient, update the SMS section to loop:

```javascript
// Inside routeAlert — find the SMS case and ensure it loops
if (channels.includes('sms') && this.twilio) {
  const numbers = Array.isArray(recipients) ? recipients : [recipients];
  for (const number of numbers) {
    try {
      await this.twilio.messages.create({
        body: alert.body,
        from: process.env.TWILIO_SMS_NUMBER,
        to:   number,
      });
      results.sms = { success: true };
    } catch (err) {
      console.error('[Notification] SMS error:', err.message);
      results.sms = { success: false, error: err.message };
    }
  }
}
```

No other changes are needed in notificationRouter for this feature.

---

## 10. Step 7 — Frontend: backendApi.js additions

**File to modify:** `frontend/src/services/backendApi.js`

Add the following SOS API functions to your existing backendApi object/module. Add them alongside your existing functions — do not replace anything:

```javascript
// ─── SOS API functions ────────────────────────────────────────────────────────
// Add these to your existing backendApi.js

export const sosApi = {
  /**
   * Create a new SOS request.
   * @param {number} latitude
   * @param {number} longitude
   * @param {string|null} message  - Optional distress message
   * @param {string|null} event_id - Optional related disaster event UUID
   */
  create: (latitude, longitude, message = null, event_id = null) =>
    apiRequest('POST', '/api/sos', { latitude, longitude, message, event_id }),

  /**
   * Get SOS requests visible to the current user.
   * @param {string} status - 'active'|'acknowledged'|'resolved'|'cancelled'|'all'
   */
  list: (status = 'active', limit = 50, offset = 0) =>
    apiRequest('GET', `/api/sos?status=${status}&limit=${limit}&offset=${offset}`),

  /** Get the current citizen's own SOS history */
  mine: () =>
    apiRequest('GET', '/api/sos/mine'),

  /**
   * Get nearest available safe zones for a coordinate.
   * @param {number} lat
   * @param {number} lon
   * @param {number} limit
   */
  nearestSafeZones: (lat, lon, limit = 5) =>
    apiRequest('GET', `/api/sos/nearest-safe-zones?lat=${lat}&lon=${lon}&limit=${limit}`),

  /** Get a single SOS by ID */
  get: (id) =>
    apiRequest('GET', `/api/sos/${id}`),

  /**
   * Acknowledge an active SOS (coordinator/admin/responder only).
   * @param {string} id
   * @param {number|null} eta_minutes
   * @param {string|null} note
   */
  acknowledge: (id, eta_minutes = null, note = null) =>
    apiRequest('PATCH', `/api/sos/${id}/acknowledge`, { eta_minutes, note }),

  /** Resolve a SOS (coordinator/admin/responder only) */
  resolve: (id) =>
    apiRequest('PATCH', `/api/sos/${id}/resolve`, {}),

  /** Cancel own active SOS (citizen only) */
  cancel: (id) =>
    apiRequest('PATCH', `/api/sos/${id}/cancel`, {}),
};
```

> **What is `apiRequest`?** It is your existing helper function in `backendApi.js` that adds the JWT Authorization header and calls `fetch`. If your file uses a different helper name, use that instead. The pattern is identical to how your incident or alert API calls work.

---

## 11. Step 8 — Frontend: Zustand store updates

**File to modify:** `frontend/src/store/useAppStore.js`

Add SOS-related state and actions to your existing Zustand store. Find the `create(...)` call and add the following alongside your existing state keys:

```javascript
// ADD to your existing Zustand store state
sosRequests:    [],        // coordinator/admin: list of active SOS in their state
activeSos:      null,      // citizen: their current active/acknowledged SOS object
nearestZones:   [],        // citizen: nearest safe zones returned after SOS creation

// ADD to your existing Zustand store actions
setSosRequests: (list) => set({ sosRequests: list }),

setActiveSos: (sos) => set({ activeSos: sos }),

setNearestZones: (zones) => set({ nearestZones: zones }),

// Called when coordinator receives sos:new event
addIncomingSos: (sosPayload) => set((state) => ({
  sosRequests: [sosPayload, ...state.sosRequests.filter(s => s.id !== sosPayload.id)],
})),

// Called when sos:status_changed or sos:resolved/cancelled arrives
updateSosStatus: (id, newStatus) => set((state) => ({
  sosRequests: state.sosRequests.map(s =>
    s.id === id ? { ...s, status: newStatus } : s
  ),
  // If the citizen's own SOS was just resolved/cancelled, clear it
  activeSos: state.activeSos?.id === id
    ? { ...state.activeSos, status: newStatus }
    : state.activeSos,
})),

clearActiveSos: () => set({ activeSos: null, nearestZones: [] }),
```

---

## 12. Step 9 — Frontend: SOSButton component

**File to create:** `frontend/src/components/sos/SOSButton.jsx`

Create the directory `frontend/src/components/sos/` first, then create this file:

```jsx
/**
 * frontend/src/components/sos/SOSButton.jsx
 *
 * The one-tap SOS button for the CitizenPortal.
 * Handles geolocation, confirmation, submission, and displays the
 * nearest safe zones + live status banner after submission.
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { sosApi } from '../../services/backendApi';
import { useAppStore } from '../../store/useAppStore';
import NearestSafeZones from './NearestSafeZones';
import SOSStatusBanner from './SOSStatusBanner';

export default function SOSButton() {
  const [phase, setPhase]         = useState('idle'); // idle | confirming | locating | sending | active | error
  const [errorMsg, setErrorMsg]   = useState('');
  const [message, setMessage]     = useState('');

  const { activeSos, setActiveSos, nearestZones, setNearestZones, clearActiveSos } = useAppStore();

  // ── Handle the initial SOS button click ────────────────────────────────────
  const handleSOSClick = () => {
    setPhase('confirming');
    setErrorMsg('');
  };

  // ── User cancelled the confirmation dialog ─────────────────────────────────
  const handleCancel = () => {
    setPhase('idle');
    setMessage('');
  };

  // ── User confirmed — get GPS and submit ────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    setPhase('locating');
    setErrorMsg('');

    // Step 1: Get GPS coordinates
    let latitude, longitude;
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout:            10000,  // 10 second timeout
          maximumAge:         0,      // Always fresh position
        });
      });
      latitude  = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (geoErr) {
      let msg = 'Could not get your location. Please try again.';
      if (geoErr.code === 1) msg = 'Location access denied. Please allow location in your browser settings.';
      if (geoErr.code === 3) msg = 'Location request timed out. Move to an open area and retry.';
      setErrorMsg(msg);
      setPhase('error');
      return;
    }

    // Step 2: Get Supabase session token
    setPhase('sending');
    let accessToken;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated. Please log in again.');
      accessToken = session.access_token;
    } catch (authErr) {
      setErrorMsg(authErr.message);
      setPhase('error');
      return;
    }

    // Step 3: Submit SOS to backend
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/sos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            latitude,
            longitude,
            message: message.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // 409 = already have an active SOS
        if (response.status === 409) {
          setErrorMsg('You already have an active SOS. See your status below.');
          setPhase('active');
          return;
        }
        throw new Error(data.error || 'Failed to send SOS. Please try again.');
      }

      // Success — store SOS and safe zones in Zustand
      setActiveSos(data.sos);
      setNearestZones(data.nearest_safe_zones || []);
      setPhase('active');
      setMessage('');

    } catch (submitErr) {
      setErrorMsg(submitErr.message);
      setPhase('error');
    }
  }, [message, setActiveSos, setNearestZones]);

  // ── Handle citizen cancelling their own SOS ────────────────────────────────
  const handleCancelSOS = useCallback(async () => {
    if (!activeSos?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/sos/${activeSos.id}/cancel`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );
      clearActiveSos();
      setPhase('idle');
    } catch (err) {
      console.error('[SOS] Cancel failed:', err);
    }
  }, [activeSos, clearActiveSos]);

  // ── Retry after error ──────────────────────────────────────────────────────
  const handleRetry = () => {
    setPhase('idle');
    setErrorMsg('');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: '1.5rem' }}>

      {/* ── If SOS is active, show status banner and safe zones ── */}
      {(phase === 'active' && activeSos) && (
        <>
          <SOSStatusBanner sos={activeSos} onCancel={handleCancelSOS} />
          <NearestSafeZones zones={nearestZones} />
        </>
      )}

      {/* ── Idle state: show the SOS button ── */}
      {phase === 'idle' && (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <button
            onClick={handleSOSClick}
            style={{
              width:           '160px',
              height:          '160px',
              borderRadius:    '50%',
              backgroundColor: '#C0392B',
              color:           '#fff',
              border:          '6px solid #922B21',
              fontSize:        '1.4rem',
              fontWeight:      '600',
              cursor:          'pointer',
              boxShadow:       '0 4px 20px rgba(192,57,43,0.45)',
              letterSpacing:   '0.05em',
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             '6px',
              margin:          '0 auto',
            }}
            aria-label="Send SOS emergency alert"
          >
            <span style={{ fontSize: '2.5rem' }}>🆘</span>
            <span>SOS</span>
          </button>
          <p style={{ marginTop: '12px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
            Tap to send an emergency alert to your nearest coordinator
          </p>
        </div>
      )}

      {/* ── Confirmation dialog ── */}
      {phase === 'confirming' && (
        <div style={{
          background:   '#fff',
          border:       '2px solid #C0392B',
          borderRadius: '12px',
          padding:      '1.25rem',
          textAlign:    'center',
        }}>
          <p style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '8px' }}>
            ⚠️ Confirm Emergency SOS
          </p>
          <p style={{ fontSize: '13px', color: '#555', marginBottom: '1rem' }}>
            This will alert your state coordinator, notify your emergency contacts via SMS,
            and share your live location. Only use in a real emergency.
          </p>
          <textarea
            placeholder="Optional: describe your situation (e.g. 'Flood water rising, need evacuation')"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            style={{
              width:        '100%',
              padding:      '8px',
              borderRadius: '8px',
              border:       '1px solid #ccc',
              fontSize:     '14px',
              marginBottom: '12px',
              resize:       'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={handleConfirm}
              style={{
                padding:         '10px 28px',
                background:      '#C0392B',
                color:           '#fff',
                border:          'none',
                borderRadius:    '8px',
                fontSize:        '15px',
                fontWeight:      '600',
                cursor:          'pointer',
              }}
            >
              Yes, Send SOS
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding:      '10px 20px',
                background:   'transparent',
                color:        '#555',
                border:       '1px solid #ccc',
                borderRadius: '8px',
                fontSize:     '15px',
                cursor:       'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Locating / Sending spinner ── */}
      {(phase === 'locating' || phase === 'sending') && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📡</div>
          <p style={{ fontWeight: '500' }}>
            {phase === 'locating' ? 'Getting your location…' : 'Sending SOS…'}
          </p>
          <p style={{ fontSize: '13px', color: '#666' }}>Please keep this screen open.</p>
        </div>
      )}

      {/* ── Error state ── */}
      {phase === 'error' && (
        <div style={{
          background:   '#FDECEA',
          border:       '1px solid #E57373',
          borderRadius: '10px',
          padding:      '1rem',
          textAlign:    'center',
        }}>
          <p style={{ color: '#B71C1C', fontWeight: '500', marginBottom: '8px' }}>
            ❌ {errorMsg}
          </p>
          <button
            onClick={handleRetry}
            style={{
              padding:      '8px 20px',
              background:   '#C0392B',
              color:        '#fff',
              border:       'none',
              borderRadius: '8px',
              cursor:       'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}

    </div>
  );
}
```

---

## 13. Step 10 — Frontend: NearestSafeZones component

**File to create:** `frontend/src/components/sos/NearestSafeZones.jsx`

```jsx
/**
 * frontend/src/components/sos/NearestSafeZones.jsx
 *
 * Renders a list of the nearest available safe zones (shelters, hospitals, etc.)
 * returned from the backend after SOS creation or from the standalone endpoint.
 *
 * Props:
 *   zones: Array<{
 *     id, name, type, status, quantity, contact, notes,
 *     latitude, longitude, distance_meters
 *   }>
 */

const TYPE_ICONS = {
  shelter:     '🏠',
  hospital:    '🏥',
  relief_camp: '⛺',
  medical:     '💊',
  food:        '🍱',
  rescue:      '🚁',
};

const TYPE_LABELS = {
  shelter:     'Shelter',
  hospital:    'Hospital',
  relief_camp: 'Relief Camp',
  medical:     'Medical Aid',
  food:        'Food & Water',
  rescue:      'Rescue Team',
};

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function getMapsLink(lat, lon, name) {
  return `https://maps.google.com/?q=${lat},${lon}&label=${encodeURIComponent(name)}`;
}

export default function NearestSafeZones({ zones }) {
  if (!zones || zones.length === 0) {
    return (
      <div style={{
        background:   '#FFF8E1',
        border:       '1px solid #FFD54F',
        borderRadius: '10px',
        padding:      '12px',
        fontSize:     '13px',
        color:        '#795548',
        marginTop:    '12px',
      }}>
        ⚠️ No nearby safe zones found in the database. Contact your local coordinator
        or call <strong>112</strong> (National Emergency) immediately.
      </div>
    );
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '10px' }}>
        📍 Nearest Safe Zones
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {zones.map((zone) => (
          <div
            key={zone.id}
            style={{
              background:   '#F1F8E9',
              border:       '1px solid #AED581',
              borderRadius: '10px',
              padding:      '10px 12px',
              display:      'flex',
              alignItems:   'flex-start',
              gap:          '10px',
            }}
          >
            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>
              {TYPE_ICONS[zone.type] || '📍'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{zone.name}</div>
              <div style={{ fontSize: '12px', color: '#558B2F', marginTop: '2px' }}>
                {TYPE_LABELS[zone.type] || zone.type}
                {' · '}
                <strong>{formatDistance(zone.distance_meters)} away</strong>
                {zone.quantity ? ` · Capacity: ${zone.quantity}` : ''}
              </div>
              {zone.contact && (
                <div style={{ fontSize: '12px', color: '#37474F', marginTop: '4px' }}>
                  📞{' '}
                  <a href={`tel:${zone.contact}`} style={{ color: '#1565C0' }}>
                    {zone.contact}
                  </a>
                </div>
              )}
              {zone.notes && (
                <div style={{ fontSize: '12px', color: '#546E7A', marginTop: '2px' }}>
                  {zone.notes}
                </div>
              )}
            </div>
            <a
              href={getMapsLink(zone.latitude, zone.longitude, zone.name)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding:      '6px 12px',
                background:   '#43A047',
                color:        '#fff',
                borderRadius: '8px',
                fontSize:     '12px',
                textDecoration: 'none',
                whiteSpace:   'nowrap',
                fontWeight:   '500',
              }}
            >
              Navigate ↗
            </a>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '12px', color: '#888', marginTop: '8px', textAlign: 'center' }}>
        In life-threatening emergency, call <strong>112</strong> immediately.
      </p>
    </div>
  );
}
```

---

## 14. Step 11 — Frontend: SOSStatusBanner component

**File to create:** `frontend/src/components/sos/SOSStatusBanner.jsx`

This component listens to Socket.io events to update its status in real time. It uses the existing Socket.io connection from your app.

```jsx
/**
 * frontend/src/components/sos/SOSStatusBanner.jsx
 *
 * Shows the live status of the citizen's active SOS.
 * Listens for Socket.io events: sos:acknowledged, sos:resolved.
 *
 * Props:
 *   sos:      The SOS object { id, status, created_at, ... }
 *   onCancel: Function to call when citizen cancels the SOS
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

// Map status to display config
const STATUS_CONFIG = {
  active: {
    icon:        '📡',
    label:       'SOS Sent — Waiting for coordinator',
    bg:          '#FFF3E0',
    border:      '#FFA726',
    color:       '#E65100',
    description: 'Your SOS has been sent. A coordinator in your area has been notified.',
  },
  acknowledged: {
    icon:        '✅',
    label:       'Help is Coming',
    bg:          '#E8F5E9',
    border:      '#66BB6A',
    color:       '#1B5E20',
    description: 'A coordinator has acknowledged your SOS and is dispatching help.',
  },
  resolved: {
    icon:        '🎉',
    label:       'SOS Resolved',
    bg:          '#E3F2FD',
    border:      '#42A5F5',
    color:       '#0D47A1',
    description: 'Your SOS has been marked as resolved. Stay safe.',
  },
  cancelled: {
    icon:        '❌',
    label:       'SOS Cancelled',
    bg:          '#F5F5F5',
    border:      '#BDBDBD',
    color:       '#424242',
    description: 'Your SOS was cancelled.',
  },
};

export default function SOSStatusBanner({ sos, onCancel }) {
  const [localSos, setLocalSos]   = useState(sos);
  const [etaInfo, setEtaInfo]     = useState(null);
  const { updateSosStatus }       = useAppStore();

  // ── Listen to Socket.io for real-time status updates ──────────────────────
  // Access the socket from the window (or import from your socket singleton)
  useEffect(() => {
    // Get the socket instance — adjust this import path to match your project.
    // In most React projects using socket.io-client, you export a singleton.
    // Example: import { socket } from '../../services/socketClient';
    // For now, we use window.__civicShieldSocket if you attach it globally,
    // or adapt to your existing pattern.
    const socket = window.__civicShieldSocket;
    if (!socket) return;

    const handleAcknowledged = (payload) => {
      if (payload.id !== localSos.id) return;
      setLocalSos(prev => ({ ...prev, status: 'acknowledged', acknowledged_at: payload.acknowledged_at }));
      if (payload.eta_minutes) {
        setEtaInfo(`Estimated arrival: ~${payload.eta_minutes} min`);
      }
      if (payload.note) {
        setEtaInfo(prev => `${prev || ''} · "${payload.note}"`);
      }
      updateSosStatus(payload.id, 'acknowledged');
    };

    const handleResolved = (payload) => {
      if (payload.id !== localSos.id) return;
      setLocalSos(prev => ({ ...prev, status: 'resolved' }));
      updateSosStatus(payload.id, 'resolved');
    };

    socket.on('sos:acknowledged', handleAcknowledged);
    socket.on('sos:resolved',     handleResolved);

    return () => {
      socket.off('sos:acknowledged', handleAcknowledged);
      socket.off('sos:resolved',     handleResolved);
    };
  }, [localSos.id, updateSosStatus]);

  const config  = STATUS_CONFIG[localSos.status] || STATUS_CONFIG.active;
  const canCancel = localSos.status === 'active';
  const isResolved = ['resolved', 'cancelled'].includes(localSos.status);

  return (
    <div style={{
      background:   config.bg,
      border:       `2px solid ${config.border}`,
      borderRadius: '12px',
      padding:      '16px',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.8rem' }}>{config.icon}</span>
        <span style={{ fontWeight: '700', fontSize: '16px', color: config.color }}>
          {config.label}
        </span>
      </div>

      <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
        {config.description}
      </p>

      {etaInfo && (
        <p style={{ fontSize: '13px', fontWeight: '600', color: config.color, marginBottom: '8px' }}>
          ⏱ {etaInfo}
        </p>
      )}

      <p style={{ fontSize: '11px', color: '#888' }}>
        SOS sent at: {new Date(localSos.created_at).toLocaleTimeString('en-IN')}
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        {canCancel && (
          <button
            onClick={onCancel}
            style={{
              padding:      '7px 16px',
              background:   'transparent',
              border:       '1px solid #999',
              borderRadius: '8px',
              fontSize:     '13px',
              color:        '#555',
              cursor:       'pointer',
            }}
          >
            Cancel SOS (False Alarm)
          </button>
        )}
        {isResolved && (
          <button
            onClick={onCancel}  // clears the activeSos from store
            style={{
              padding:      '7px 16px',
              background:   config.border,
              border:       'none',
              borderRadius: '8px',
              fontSize:     '13px',
              color:        '#fff',
              cursor:       'pointer',
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
```

> **Socket instance:** The component above references `window.__civicShieldSocket`. You need to expose your Socket.io client instance so components can access it. The cleanest way is to export it from a singleton file. If you already have `frontend/src/services/socketClient.js` or similar, import from there. If not, create one:

```javascript
// frontend/src/services/socketClient.js
import { io } from 'socket.io-client';
import { supabase } from './supabaseClient';

let socket = null;

export async function getSocket() {
  if (socket && socket.connected) return socket;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  socket = io(import.meta.env.VITE_BACKEND_URL, {
    auth:          { token },
    transports:    ['websocket'],
    reconnection:  true,
  });

  // Expose globally for components that can't easily import (optional)
  window.__civicShieldSocket = socket;

  return socket;
}

export { socket };
```

Then in `SOSStatusBanner.jsx`, replace `window.__civicShieldSocket` with:
```javascript
import { socket } from '../../services/socketClient';
```

---

## 15. Step 12 — Frontend: EmergencyContacts in Profile

**File to modify:** The page or component where users edit their profile (typically your CitizenPortal or a Profile/Settings page).

Add an Emergency Contacts section that lets citizens add up to 3 contacts (name + phone). These are stored in `user_profiles.emergency_contacts` as a JSONB array.

```jsx
/**
 * frontend/src/components/sos/EmergencyContactsEditor.jsx
 *
 * Lets citizens save up to 3 emergency contacts.
 * These are sent SMS when the citizen triggers SOS.
 */

import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function EmergencyContactsEditor({ initialContacts = [], userId }) {
  const [contacts, setContacts] = useState(
    initialContacts.length > 0
      ? initialContacts
      : [{ name: '', phone: '' }]
  );
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const [error,  setError]    = useState('');

  const addContact = () => {
    if (contacts.length >= 3) return;
    setContacts(prev => [...prev, { name: '', phone: '' }]);
  };

  const removeContact = (index) => {
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  const updateContact = (index, field, value) => {
    setContacts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleSave = async () => {
    // Validate: phone numbers should start with + and contain digits
    const valid = contacts.filter(c => c.name.trim() && c.phone.trim());
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    for (const c of valid) {
      if (!phoneRegex.test(c.phone.replace(/\s/g, ''))) {
        setError(`Invalid phone number: ${c.phone}. Use format: +919876543210`);
        return;
      }
    }

    setSaving(true);
    setError('');

    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({ emergency_contacts: valid })
      .eq('id', userId);

    setSaving(false);

    if (updateErr) {
      setError('Failed to save. Please try again.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div style={{
      background:   '#fff',
      border:       '1px solid #ddd',
      borderRadius: '12px',
      padding:      '1rem',
      marginTop:    '1rem',
    }}>
      <h3 style={{ fontWeight: '600', marginBottom: '4px', fontSize: '15px' }}>
        🚨 Emergency Contacts
      </h3>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
        These people receive an SMS with your location when you trigger SOS (max 3).
      </p>

      {contacts.map((contact, index) => (
        <div key={index} style={{
          display:       'flex',
          gap:           '8px',
          marginBottom:  '8px',
          alignItems:    'center',
        }}>
          <input
            type="text"
            placeholder="Name"
            value={contact.name}
            onChange={(e) => updateContact(index, 'name', e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px' }}
          />
          <input
            type="tel"
            placeholder="+91 98765 43210"
            value={contact.phone}
            onChange={(e) => updateContact(index, 'phone', e.target.value)}
            style={{ flex: 1.2, padding: '8px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px' }}
          />
          <button
            onClick={() => removeContact(index)}
            style={{
              padding:      '8px 10px',
              background:   'transparent',
              border:       '1px solid #e57373',
              borderRadius: '8px',
              color:        '#e57373',
              cursor:       'pointer',
              fontSize:     '14px',
            }}
            aria-label="Remove contact"
          >
            ✕
          </button>
        </div>
      ))}

      {error && (
        <p style={{ color: '#C0392B', fontSize: '13px', marginBottom: '8px' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        {contacts.length < 3 && (
          <button
            onClick={addContact}
            style={{
              padding:      '8px 16px',
              background:   'transparent',
              border:       '1px solid #43A047',
              borderRadius: '8px',
              color:        '#43A047',
              cursor:       'pointer',
              fontSize:     '13px',
            }}
          >
            + Add Contact
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding:      '8px 20px',
            background:   saving ? '#ccc' : '#1565C0',
            border:       'none',
            borderRadius: '8px',
            color:        '#fff',
            cursor:       saving ? 'not-allowed' : 'pointer',
            fontSize:     '13px',
            fontWeight:   '500',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Contacts'}
        </button>
      </div>
    </div>
  );
}
```

---

## 16. Step 13 — Frontend: Update CitizenPortal page

**File to modify:** `frontend/src/pages/CitizenPortal.jsx`

Import and render the SOS components at the top of the citizen's view. Place the SOS section above the incident reporting section so it is immediately visible.

```jsx
// ADD these imports at the top of CitizenPortal.jsx
import SOSButton from '../components/sos/SOSButton';
import EmergencyContactsEditor from '../components/sos/EmergencyContactsEditor';

// Inside your component, add this section near the TOP of the JSX return,
// before any other content (incident form, map, etc.)

// Assuming 'profile' and 'user' are already available from useAuth():
const { user, profile } = useAuth();

// Add to JSX return:
<section style={{ marginBottom: '2rem' }}>
  <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '0.5rem' }}>
    Emergency SOS
  </h2>
  <p style={{ fontSize: '13px', color: '#666', marginBottom: '1rem' }}>
    In an emergency, tap below to instantly alert your state coordinator and notify your emergency contacts.
  </p>

  {/* SOS Button — handles the full flow internally */}
  <SOSButton />

  {/* Emergency contacts editor — visible below the SOS button */}
  <EmergencyContactsEditor
    initialContacts={profile?.emergency_contacts || []}
    userId={user?.id}
  />
</section>
```

> **Note:** The `profile` object should contain `emergency_contacts` because your `useAuth.jsx` already fetches the full profile. If it doesn't select `emergency_contacts`, add it to the select query in `useAuth.jsx`:
> ```javascript
> .select('role, state_id, full_name, emergency_contacts, states(bbox_north, bbox_south, bbox_east, bbox_west)')
> ```

---

## 17. Step 14 — Frontend: CoordinatorDashboard SOS Panel

**File to create:** `frontend/src/components/sos/SOSAlertPanel.jsx`

```jsx
/**
 * frontend/src/components/sos/SOSAlertPanel.jsx
 *
 * Real-time SOS request panel for coordinators and admins.
 * Shows all active SOS in the coordinator's state.
 * Listens to Socket.io 'sos:new' and 'sos:status_changed' events.
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { sosApi } from '../../services/backendApi';

function getMapsLink(lat, lon) {
  return `https://maps.google.com/?q=${lat},${lon}`;
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function SOSAlertPanel() {
  const { sosRequests, setSosRequests, addIncomingSos, updateSosStatus } = useAppStore();
  const [loading, setLoading]         = useState(true);
  const [acknowledging, setAcknowledging] = useState(null); // SOS id being acknowledged

  // ── Load initial list of active SOS ─────────────────────────────────────
  useEffect(() => {
    sosApi.list('active')
      .then(data => {
        setSosRequests(data.sos_requests || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('[SOSAlertPanel] Load error:', err);
        setLoading(false);
      });
  }, [setSosRequests]);

  // ── Listen for real-time SOS events ──────────────────────────────────────
  useEffect(() => {
    const socket = window.__civicShieldSocket;
    if (!socket) return;

    const handleNew = (payload) => {
      addIncomingSos(payload);
      // Play a notification sound if browser supports it
      try {
        new Audio('/sounds/sos-alert.mp3').play().catch(() => {});
      } catch (_) {}
    };

    const handleStatusChanged = (payload) => {
      updateSosStatus(payload.id, payload.status);
    };

    socket.on('sos:new',            handleNew);
    socket.on('sos:status_changed', handleStatusChanged);
    socket.on('sos:cancelled',      (p) => updateSosStatus(p.id, 'cancelled'));

    return () => {
      socket.off('sos:new',            handleNew);
      socket.off('sos:status_changed', handleStatusChanged);
      socket.off('sos:cancelled');
    };
  }, [addIncomingSos, updateSosStatus]);

  // ── Acknowledge a SOS ─────────────────────────────────────────────────────
  const handleAcknowledge = async (sosId) => {
    setAcknowledging(sosId);
    try {
      await sosApi.acknowledge(sosId, null, null);
      updateSosStatus(sosId, 'acknowledged');
    } catch (err) {
      console.error('[SOSAlertPanel] Acknowledge error:', err);
      alert('Failed to acknowledge SOS. Please try again.');
    } finally {
      setAcknowledging(null);
    }
  };

  // ── Resolve a SOS ─────────────────────────────────────────────────────────
  const handleResolve = async (sosId) => {
    if (!window.confirm('Mark this SOS as resolved?')) return;
    try {
      await sosApi.resolve(sosId);
      updateSosStatus(sosId, 'resolved');
    } catch (err) {
      console.error('[SOSAlertPanel] Resolve error:', err);
      alert('Failed to resolve SOS. Please try again.');
    }
  };

  const active = sosRequests.filter(s => s.status === 'active');
  const acknowledged = sosRequests.filter(s => s.status === 'acknowledged');

  if (loading) return <p style={{ fontSize: '14px', color: '#888' }}>Loading SOS requests…</p>;

  return (
    <div style={{
      background:   '#fff',
      border:       '2px solid #E53935',
      borderRadius: '12px',
      overflow:     'hidden',
      marginBottom: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        background: '#E53935',
        color:      '#fff',
        padding:    '12px 16px',
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
      }}>
        <span style={{ fontSize: '1.4rem' }}>🆘</span>
        <div>
          <div style={{ fontWeight: '700', fontSize: '15px' }}>
            Live SOS Requests
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            {active.length} active · {acknowledged.length} acknowledged
          </div>
        </div>
        {active.length > 0 && (
          <div style={{
            marginLeft:   'auto',
            background:   '#fff',
            color:        '#E53935',
            borderRadius: '20px',
            padding:      '3px 12px',
            fontWeight:   '700',
            fontSize:     '13px',
          }}>
            {active.length} URGENT
          </div>
        )}
      </div>

      {/* SOS list */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sosRequests.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#888', fontSize: '14px', padding: '20px 0' }}>
            ✅ No active SOS requests in your area.
          </p>
        ) : (
          sosRequests
            .filter(s => ['active', 'acknowledged'].includes(s.status))
            .map((sos) => (
              <div
                key={sos.id}
                style={{
                  background:   sos.status === 'active' ? '#FFF3E0' : '#E8F5E9',
                  border:       `1px solid ${sos.status === 'active' ? '#FFA726' : '#66BB6A'}`,
                  borderRadius: '10px',
                  padding:      '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{
                    fontWeight:   '600',
                    fontSize:     '14px',
                    color:        sos.status === 'active' ? '#E65100' : '#1B5E20',
                  }}>
                    {sos.status === 'active' ? '🆘 ACTIVE' : '✅ ACKNOWLEDGED'}
                    {' — '}
                    {sos.user_profiles?.full_name || 'Unknown citizen'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {timeAgo(sos.created_at)}
                  </span>
                </div>

                {sos.message && (
                  <p style={{ fontSize: '13px', color: '#333', marginBottom: '6px' }}>
                    💬 "{sos.message}"
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <a
                    href={getMapsLink(sos.latitude, sos.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding:        '6px 14px',
                      background:     '#1565C0',
                      color:          '#fff',
                      borderRadius:   '8px',
                      fontSize:       '12px',
                      textDecoration: 'none',
                      fontWeight:     '500',
                    }}
                  >
                    📍 View on Map
                  </a>

                  {sos.status === 'active' && (
                    <button
                      onClick={() => handleAcknowledge(sos.id)}
                      disabled={acknowledging === sos.id}
                      style={{
                        padding:      '6px 14px',
                        background:   '#43A047',
                        color:        '#fff',
                        border:       'none',
                        borderRadius: '8px',
                        fontSize:     '12px',
                        cursor:       acknowledging === sos.id ? 'not-allowed' : 'pointer',
                        fontWeight:   '500',
                      }}
                    >
                      {acknowledging === sos.id ? 'Acknowledging…' : '✓ Acknowledge'}
                    </button>
                  )}

                  {sos.status === 'acknowledged' && (
                    <button
                      onClick={() => handleResolve(sos.id)}
                      style={{
                        padding:      '6px 14px',
                        background:   '#5E35B1',
                        color:        '#fff',
                        border:       'none',
                        borderRadius: '8px',
                        fontSize:     '12px',
                        cursor:       'pointer',
                        fontWeight:   '500',
                      }}
                    >
                      ✔ Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
```

**File to modify:** `frontend/src/pages/CoordinatorDashboard.jsx`

Add the import and render the SOSAlertPanel at the very top of the coordinator's dashboard content, before any other panels:

```jsx
// ADD import at the top
import SOSAlertPanel from '../components/sos/SOSAlertPanel';

// ADD inside JSX return, as the first thing inside the dashboard content div:
<SOSAlertPanel />
```

---

## 18. Step 15 — schema.sql sync

**File to modify:** `supabase/schema.sql`

After the migration is applied and tested, you must update `schema.sql` to match. Your CI drift guard will fail if you don't.

Append the following sections to `schema.sql` in the correct logical position (after the `misinformation_checks` table block):

1. The `sos_requests` table DDL (copy from migration 010, without the `IF NOT EXISTS` clauses — `schema.sql` assumes a fresh DB)
2. The `get_nearest_safe_zones` function DDL (copy from 010b)
3. The `emergency_contacts` column on `user_profiles`
4. All RLS policies and GRANT statements

Additionally, add `sos_requests` to the Realtime publication list at the bottom of `schema.sql` where `supabase_realtime` is configured.

> **Run the drift guard locally to confirm:**
> ```bash
> cd civicshield-ai
> supabase db reset       # applies all migrations including 010
> # Then run your existing drift guard check
> ```

---

## 19. Step 16 — Environment Variables

No new environment variables are required for this feature. All the services it uses (Twilio SMS, Socket.io, Supabase) are already configured. Verify the following are present:

**`backend/.env`** — these must already be set:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_SMS_NUMBER=+1XXXXXXXXXX
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

**`frontend/.env.local`** — these must already be set:
```
VITE_BACKEND_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 20. Step 17 — Testing Guide

Test in this exact order. Do not skip steps.

### Phase 1 — Database

```sql
-- Run in Supabase SQL editor after applying migrations

-- 1. Verify table exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'sos_requests'
ORDER BY ordinal_position;

-- 2. Verify function exists
SELECT proname FROM pg_proc WHERE proname = 'get_nearest_safe_zones';

-- 3. Test the function (insert a test resource first if none exist)
INSERT INTO resources (name, type, status, quantity, location, state_id)
VALUES (
  'Test Shelter', 'shelter', 'available', 100,
  'SRID=4326;POINT(73.8567 18.5204)',  -- Pune
  (SELECT id FROM states WHERE code = 'MH')
);

-- Now test the function
SELECT * FROM get_nearest_safe_zones(18.5204, 73.8567, 5);
-- Expect: 1 row with distance_meters > 0

-- 4. Verify emergency_contacts column
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles' AND column_name = 'emergency_contacts';
```

### Phase 2 — Backend API (use curl or Postman)

First get a valid JWT by logging in through the frontend, then copy the access token from browser DevTools → Application → Local Storage → `sb-<project>-auth-token`.

```bash
BASE=http://localhost:3001
TOKEN="paste-your-jwt-here"

# 1. Get nearest safe zones (no auth required)
curl "$BASE/api/sos/nearest-safe-zones?lat=18.5204&lon=73.8567&limit=3"
# Expect: { safe_zones: [...] }

# 2. Create an SOS (requires auth)
curl -X POST "$BASE/api/sos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"latitude": 18.5204, "longitude": 73.8567, "message": "Test SOS"}'
# Expect: 201 { success: true, sos: {...}, nearest_safe_zones: [...] }

# Save the SOS id from the response
SOS_ID="paste-sos-id-here"

# 3. Get own SOS list
curl "$BASE/api/sos/mine" \
  -H "Authorization: Bearer $TOKEN"
# Expect: { sos_requests: [{...}] }

# 4. Try creating another SOS (should return 409)
curl -X POST "$BASE/api/sos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"latitude": 18.52, "longitude": 73.85}'
# Expect: 409 { error: "You already have an active SOS..." }

# 5. Cancel the SOS
curl -X PATCH "$BASE/api/sos/$SOS_ID/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
# Expect: 200 { success: true, sos: { status: "cancelled", ... } }
```

### Phase 3 — Frontend end-to-end

1. Open two browser windows side by side.
2. **Window 1:** Log in as a citizen.
3. **Window 2:** Log in as a coordinator for the same state.
4. **In Window 1:**
   - Go to CitizenPortal.
   - Add an emergency contact (a real phone number you control) and save.
   - Click the SOS button.
   - Accept the browser location prompt.
   - Confirm the SOS.
   - Verify: nearest safe zones list appears below.
   - Verify: SOSStatusBanner shows "Waiting for coordinator".
5. **In Window 2:**
   - Go to CoordinatorDashboard.
   - Verify: SOS alert panel shows the incoming SOS in real time (within 2 seconds).
   - Verify: Google Maps link opens to the correct location.
   - Click "Acknowledge".
6. **Back in Window 1:**
   - Verify: SOSStatusBanner updates to "Help is Coming" without page refresh.
7. **In Window 2:** Click "Mark Resolved".
8. **In Window 1:** Verify: banner updates to "Resolved". Click Dismiss.
9. **Check your phone:** Verify SMS was received at the emergency contact number.

### Phase 4 — Error cases to verify

| Scenario | Expected behaviour |
|----------|--------------------|
| Citizen denies location permission | Error message: "Location access denied..." with Try Again |
| No resources in DB | NearestSafeZones shows "No nearby safe zones found" message |
| Second SOS while one is active | 409 error: "You already have an active SOS" |
| Coordinator tries to create SOS via API | Should work — any authenticated user can trigger SOS |
| Invalid lat/lon in nearest-safe-zones | 400 error with descriptive message |

---

## 21. Known Limitations & Future Work

These are acceptable for v1. Document them in your `PROJECT_SCORECARD.md` and `WORKPLAN_NEXT_PHASE.md`.

### Current limitations

| Limitation | Impact | Suggested fix for v2 |
|------------|--------|----------------------|
| Requires internet connectivity | SOS fails if network is down — the most common disaster scenario | Combine with Offline-First PWA: store last-known coordinator contact in service worker cache; show offline SOS fallback with emergency numbers |
| Resource data freshness | Nearest safe zones are only as accurate as coordinators' data entry | Add coordinator reminder workflow: push notification every 6h during active disaster asking them to update resource status |
| No geofencing on coordinator assignment | If no coordinator is online for that state, SOS goes unacknowledged | Add a timeout: if no acknowledgement in 10 minutes, escalate to admin via email |
| SMS costs money | Each SOS triggers Twilio SMS charges | Use WhatsApp free tier for emergency contacts where possible; add rate limiting |
| No audio alert for coordinators | Coordinators may miss the visual panel | Add the `/sounds/sos-alert.mp3` file to `frontend/public/sounds/` — any short alert sound works |
| Socket.io singleton not formalized | Components use `window.__civicShieldSocket` which is fragile | Formalize `socketClient.js` singleton and import it everywhere |

### Sound file

Add a short audio alert for the coordinator panel. Place any `.mp3` file here:
```
frontend/public/sounds/sos-alert.mp3
```
Free options: freesound.org (search "alert beep", filter CC0 license).

---

*Document version: 1.0 — Written for CivicShield AI stack as of migrations 001–009.*
*Follow-on features: Offline-First Emergency Mode, Missing Persons Registry.*
