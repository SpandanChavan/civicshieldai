# CivicShield AI — Complete Technical Reference

A full, ground-up explanation of this codebase: what every service does, how data moves
through it, how security is enforced, and every change made during the audit.

Written against the repository state after the audit pass. All claims here were verified
by reading the source and running the test suites — not inferred from documentation.

---

## Table of contents

1. [What the system is](#1-what-the-system-is)
2. [Repository layout](#2-repository-layout)
3. [End-to-end architecture](#3-end-to-end-architecture)
4. [The identity & tenancy model](#4-the-identity--tenancy-model) ← *the most important concept*
5. [Backend service](#5-backend-service)
6. [Data ingestion pipeline](#6-data-ingestion-pipeline)
7. [Notification system](#7-notification-system)
8. [ML service](#8-ml-service)
9. [Database](#9-database)
10. [Frontend](#10-frontend)
11. [Real-time layer](#11-real-time-layer)
12. [Caching](#12-caching)
13. [Testing & CI](#13-testing--ci)
14. [Deployment](#14-deployment)
15. [Running it locally](#15-running-it-locally)
16. [Audit: everything fixed](#16-audit-everything-fixed)
17. [Known remaining issues](#17-known-remaining-issues)
18. [Glossary of project conventions](#18-glossary-of-project-conventions)

---

## 1. What the system is

CivicShield AI is a **multi-hazard disaster management platform for India**. It performs
four jobs:

| Job | How |
|---|---|
| **Monitor** | Polls 8 external disaster feeds continuously, normalises them into one event stream |
| **Predict** | Flood / earthquake / heatwave risk scoring via a Python ML service |
| **Respond** | Citizens file incident reports and raise SOS; state coordinators triage them |
| **Warn** | Coordinators broadcast alerts over email, SMS, WhatsApp, Telegram and web push |

The organising principle is **Indian state jurisdiction**. Every event, alert, resource,
incident and SOS carries a `state_id`, and a coordinator only ever sees and touches their
own state's rows. Admins are nationwide. This single idea shapes the database schema, the
API, the WebSocket rooms and the cache keys.

**Scale of the codebase:** ~4,400 LOC backend, ~9,000 LOC frontend, ~980 LOC Python,
~2,000 lines of SQL across 16 migrations.

---

## 2. Repository layout

```
civicshield-ai/
├── frontend/          React 18 + Vite + Tailwind + Leaflet   → Vercel
├── backend/           Node 20 + Express 4 + Socket.io        → Render
├── ml-service/        Python 3.11 + FastAPI + OR-Tools       → Render
├── libretranslate/    Dockerfile only (self-hosted MT)       → Render
├── supabase/          16 migrations + schema.sql + config
├── scripts/           One-off SQL/JS helpers
├── docs/rls_matrix.md Access-control matrix (10 tables × 6 roles)
└── .github/workflows/ci.yml   4 CI jobs
```

Four independently deployable units share one database. There is no shared code package
between them — the contract is HTTP + the Postgres schema.

---

## 3. End-to-end architecture

```
 EXTERNAL FEEDS
 USGS · NASA FIRMS · GDACS · NASA EONET · Open-Meteo · NCS · CWC · FloodList
        │
        │  node-cron, staggered minute offsets (no two pollers collide)
        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ backend/src/cron/apiPollers.js                                  │
 │                                                                 │
 │  per-source service  →  normalise to the canonical event shape  │
 │      { source, event_type, title, description, severity,        │
 │        location:{lat,lon}, raw_data, dedup_hash }               │
 │                                                                 │
 │  enrich (bounded concurrency = 10):                             │
 │    ├─ resolveStateId(lat,lon) → RPC get_state_from_point        │
 │    │    (promise-cached per ~1 km grid cell)                    │
 │    └─ calibrateSeverity()     → ML /classify/severity           │
 │         (circuit breaker: opens after 5 failures, 5 min)        │
 │                                                                 │
 │  upsert into events ON CONFLICT (dedup_hash)                    │
 │  io.to('public').emit('events:updated')                         │
 │                                                                 │
 │  auto-alert: India-source events with severity High|Critical    │
 │    and alerted_at IS NULL → create alert → fan out → stamp      │
 └─────────────────────────────────────────────────────────────────┘
        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ Supabase — PostgreSQL 15 + PostGIS                              │
 │ RLS on every table · Realtime publication on events/alerts/sos  │
 └─────────────────────────────────────────────────────────────────┘
        ▼
 FRONTEND — three redundant paths keep the UI live:
   1. TanStack Query REST poll        (every 5 min, staleTime 60 s)
   2. Supabase Realtime               (postgres_changes INSERT)
   3. Socket.io                       (room-scoped server push)
        └──→ all three converge into ONE Zustand store
             └──→ DisasterMap imperatively diffs the Leaflet marker set
```

### Why three redundant live-data paths?

They fail differently. REST polling survives anything but keeps a worst-case 5-minute lag.
Supabase Realtime catches direct DB writes (including writes the backend didn't make).
Socket.io carries backend-originated signals with room scoping the DB can't express. In a
disaster-response tool, the cost of a missed event outweighs the redundancy.

---

## 4. The identity & tenancy model

**This is the concept to understand first — everything else follows from it.**

### Three layers

**Layer 1 — Frontend** holds the Supabase **anon** key. `services/backendApi.js` installs an
axios request interceptor that attaches the live Supabase JWT to every outgoing call:

```js
backendApi.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) config.headers.Authorization = `Bearer ${session.access_token}`;
  return config;
});
```

> Any frontend code that talks to the backend **must** go through `backendApi`. A bare
> `fetch()` sends no token, so the backend sees an anonymous request. This was a real bug
> in `pushService.js` — see [§16](#16-audit-everything-fixed).

**Layer 2 — `middleware/stateScope.js`**, mounted globally on `/api`:

```js
app.use('/api', stateScope);
```

It is **soft auth**: it never rejects a request. It verifies the JWT with the anon client,
loads `user_profiles.{role, state_id}` with the service client, and attaches three fields:

| Field | Meaning |
|---|---|
| `req.userId` | Supabase auth user id, or `undefined` |
| `req.userRole` | `citizen` / `responder` / `coordinator` / `admin` |
| `req.userStateId` | The coordinator's assigned state UUID |

A 60-second `node-cache` keyed on user id avoids two DB round-trips per request.

**Layer 3 — each route handler** does its own authorization and tenancy filtering:

```js
if (!req.userId) return res.status(401).json(...);            // authentication
if (req.userRole !== 'coordinator') return res.status(403)...; // authorization
if (req.userRole === 'coordinator') q = q.eq('state_id', req.userStateId); // tenancy
```

### The critical consequence

The backend uses the **service_role** key, which **bypasses RLS entirely**. So:

> **Row-level security in Postgres does *not* protect the REST API.** Every `/api` route
> is responsible for its own tenancy filter. If a route forgets `.eq('state_id', …)`, it
> is a cross-tenant hole, and no database policy will catch it.

RLS is the second line of defence, protecting the path where the **frontend queries
Supabase directly** with the anon key (`useAuth` reads `user_profiles`; the Realtime
subscriptions read `events`/`alerts`/`sos_requests`).

This is exactly the bug class the audit found six instances of.

### Tenancy on writes — the correct pattern

Apply the state filter **to the write statement itself**, not as a separate `SELECT`-then-check:

```js
let q = getDb().from('resources').update(updates).eq('id', req.params.id);
if (req.userRole === 'coordinator') q = q.eq('state_id', req.userStateId);
const { data } = await q.select().maybeSingle();
if (!data) return res.status(404).json({ error: 'Not found in your jurisdiction' });
```

One round-trip, and atomic — no time-of-check/time-of-use window between the check and
the write. Returning **404** rather than 403 also avoids confirming that a row exists in
another state.

### Roles

| Role | Scope | Can |
|---|---|---|
| `anon` | public | read active events, sent alerts, resources, states; fact-check; find safe zones |
| `citizen` | own rows | + file incidents, raise SOS, read own reports/SOS |
| `responder` | national | + read all SOS and incidents, acknowledge/resolve SOS |
| `coordinator` | **one state** | + triage incidents, create/delete alerts, manage resources, deactivate events |
| `admin` | national | everything, + assign coordinators to states, change roles, read audit logs |

A coordinator with **no** `state_id` has no jurisdiction and is refused on all writes —
matching the rule `POST /api/alerts` has always enforced.

---

## 5. Backend service

### Boot sequence (`src/app.js`)

1. `dotenv`, then `global.WebSocket = require('ws')` (Supabase Realtime needs a WS impl in Node)
2. Sentry — **only if** `SENTRY_DSN` is set
3. `helmet()` → CORS allow-list → `express.json({ limit: '10mb' })` → request logger
4. Global rate limit: **100 req / 15 min** in production, 2000 in dev
5. `app.use('/api', stateScope)`
6. Eight routers mounted
7. `/health` — probes DB and ML, **always returns 200** (see below)
8. 404 handler → Sentry error handler → `errorHandler`
9. Socket.io auth middleware + room joins
10. `httpServer.listen()` → `startCronJobs(io)`

**CORS** is a single shared function used by both Express and Socket.io, driven by
`ALLOWED_ORIGINS` (comma-separated). Requests with **no** Origin header (curl,
server-to-server, native apps) are allowed.

**`/health` contract:** it reports dependency status in the body
(`database: connected|disconnected`, `ml_service: online|offline`) and never fails the
check itself. The two `catch {}` blocks are intentional and now carry comments saying so.

### Middleware

| File | Purpose |
|---|---|
| `stateScope.js` | Soft auth + profile cache (60 s TTL). Mounted globally on `/api`. |
| `auth.js` | **Hard** gates: `requireAuth`, `requireRole(...)`, `optionalAuth`. Currently unused — available for routers mounted outside `/api`. |
| `cache.js` | In-memory response cache, **keyed by URL + caller scope**. |
| `validator.js` | `validate(schema)` / `validateQuery(schema)` Zod factories. |
| `rateLimiter.js` | `strictLimiter` (30/15min), `standardLimiter` (200/15min), `publicLimiter` (500/15min). |
| `requestLogger.js` | Assigns an 8-char `requestId`, logs `METHOD path → status Xms [id]`. |
| `errorHandler.js` | Last middleware. Structured JSON; **stack traces only outside production**. |

### `lib/db.js` — the client singletons

```js
getAdminDb()  // service_role key — bypasses RLS. Backend use only.
getAnonDb()   // anon key — respects RLS. Used to verify JWTs.
```

Lazily constructed once per process. Before this existed, every request called
`createClient()`, opening a new TCP connection each time. **Never call `createClient()`
in a route** — all routes now use these singletons.

### Complete API surface

Auth column: **—** public · **A** authenticated · **C** coordinator · **Ad** admin · **R** responder

#### `/api/events`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | — | `mode=diverse` runs 11 parallel per-type queries (60 each) so the map isn't all earthquakes. Cached 30 s. Coordinator-scoped. |
| GET | `/stats/summary` | — | Counts by type and severity. Cached 60 s. **Declared before `/:id`.** |
| GET | `/ingestion-health` | C/Ad | In-memory per-source health snapshot. **Declared before `/:id`.** |
| GET | `/:id` | — | Single event, EWKB decoded to `lat`/`lon`. |
| PATCH | `/:id/deactivate` | C/Ad | Soft delete. **State-scoped.** |

> **Express route ordering:** `/stats/summary` and `/ingestion-health` must precede
> `/:id`, or Express matches them as an `:id` parameter. This has bitten the project
> before (commit `ce2b65f`). The same rule applies to `/api/sos/mine` and
> `/api/sos/nearest-safe-zones`.

#### `/api/alerts`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | — | Coordinator-scoped list. |
| GET | `/:id` | — | Alert. **Delivery logs (`alert_logs`) only for C/Ad**, and only for their own state. |
| POST | `/subscribe` | — | Upsert a web-push subscription on `endpoint`. |
| POST | `/` | C/Ad | Create + dispatch. Records `created_by`. |
| DELETE | `/:id` | C/Ad | **State-scoped.** |

**Alert lifecycle:** insert as `draft` → respond `201` immediately → background IIFE sets
`sending`, calls `routeAlert()`, writes one `alert_logs` row per recipient, then sets
`sent` (or `failed`). The HTTP response never waits on Twilio/Resend/Telegram.

#### `/api/incidents`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | A | Citizens see own; coordinators see their state; admins see all. |
| GET | `/pending` | C | Awaiting review in their state. |
| GET | `/:id` | A | **Owner / coordinator-of-that-state / admin / responder only.** |
| POST | `/` | A | Own limiter: 5 / 10 min. |
| PATCH | `/:id/approve` | C/Ad | Creates a real `events` row. State-checked. |
| PATCH | `/:id/reject` | C/Ad | Requires a reason ≥ 5 chars. State-checked. |
| PATCH | `/:id/status` | C/Ad | Legacy generic transition. State-checked. |

**Submission flow:** validate → `get_state_from_point(lat,lon)` → insert as
`pending_review` → `logAudit` → **respond 201** → emit `new_incident` to `state:<id>` →
*then*, in the background, POST the first media URL to the ML vision service and, on
success, write `ai_classification` and emit `incident_classified`. The photo classifier
can never delay or break a citizen's submission.

**Approve flow:** reads the incident, decodes its EWKB location back to WKT, inserts an
`events` row (`source: 'citizen_report'`), then links the report via `event_id`. This is
how a citizen report reaches the public map.

#### `/api/sos` — the life-safety path
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/` | A | **409** if the user already has an active SOS. |
| GET | `/` | C/Ad/R | Coordinator-scoped. |
| GET | `/mine` | A | Own history (last 10). **Before `/:id`.** |
| GET | `/nearest-safe-zones` | — | **Intentionally public** — must work pre-login. **Before `/:id`.** |
| GET | `/:id` | A | Owner / coordinator-of-state / admin / responder. |
| PATCH | `/:id/acknowledge` | C/Ad/R | **State-scoped for coordinators.** |
| PATCH | `/:id/resolve` | C/Ad/R | **State-scoped for coordinators.** |
| PATCH | `/:id/cancel` | A | Owner only. |

**POST /api/sos does eleven things in order:** duplicate check → resolve state →
build PostGIS point → insert → audit → load profile (name + emergency contacts) → fetch
email via `auth.admin.getUserById` → emit `sos:new` to `state:<id>`, `role:admin`,
`role:responder` → SMS every emergency contact with a Google Maps link → query the 5
nearest safe zones → respond with the SOS **and** those safe zones in one payload.

A failing SMS is caught and logged; it never fails the SOS.

#### `/api/predictions`
| Method | Path | Auth | Limiter |
|---|---|---|---|
| POST | `/misinformation` | — | `strictLimiter` (30/15min) |
| GET | `/misinformation/history` | — | `standardLimiter`; **full text only for C/Ad**, others get a 120-char preview |
| GET | `/flood/:basinId` | — | `standardLimiter` |
| GET | `/earthquake/:district` | — | `standardLimiter` |
| GET | `/heatwave/:district` | — | `standardLimiter` |

These are the bridge between live data and the ML service:

- **flood** → Open-Meteo GloFAS river discharge, 30 days history → ML Prophet forecast
- **earthquake** → USGS FDSN, 30 days within 300 km → NDMA seismic-zone scoring
- **heatwave** → Open-Meteo max temps, anomalies vs a rolling baseline → IMD thresholds

Each response carries **`demo: true` and `source: 'synthetic_fallback'`** when the
upstream fetch failed and synthetic data was substituted. The UI can therefore never
present fabricated numbers as real measurements. This is an unusually honest design.

#### `/api/resources`
| Method | Path | Auth |
|---|---|---|
| GET | `/` | — (coordinator-scoped) |
| POST | `/` | C/Ad |
| PATCH | `/:id` | C/Ad, **state-scoped** |
| DELETE | `/:id` | C/Ad, **state-scoped** |

`ResourceUpdateSchema` is `.strict()`, so an unknown key like `state_id` in the body is a
400 — a coordinator cannot move a resource into another state.

#### `/api/states` · `/api/admin`
`GET /api/states` — all 36 states/UTs with bounding boxes. Static reference data, cached
**1 hour**.

`/api/admin/*` is gated by a `router.use()` requiring `role === 'admin'` before any
handler: `GET /coordinators`, `PATCH /coordinators/:id`, `GET /stats` (cached 30 s),
`GET /audit-logs`, `GET /users`, `PATCH /users/:id`.

### Utilities

- **`utils/geoHelpers.js` → `parseWkbPoint(hex)`** — decodes PostGIS EWKB hex to
  `{lat, lon}`. Supabase's REST API returns geography columns as **EWKB binary hex, not
  WKT**, so this is needed everywhere a location is read. Layout: 1 B byte-order + 4 B
  type + 4 B SRID (if present) + 8 B X(lon) + 8 B Y(lat). Returns `null` on anything
  undecodable or out of range.
- **`utils/axiosClient.js`** — axios + `axios-retry`, 3 retries with exponential backoff
  on network errors and 5xx. All ingestion services use this, not bare axios.
- **`utils/auditLogger.js` → `logAudit(action, userId, entityId, metadata)`** — writes to
  `audit_logs`, swallowing its own failures so auditing can never break a request.

---

## 6. Data ingestion pipeline

### The eight sources

| Source | Cron | Cache | Coverage | Dedup key |
|---|---|---|---|---|
| USGS earthquakes | `*/5` | 5 min | Global, **excluding India** | `f.id` |
| NASA FIRMS (VIIRS) | `3,18,33,48` | 15 min | India bbox, needs `FIRMS_API_KEY` | `firms:lat:lon:date:time` |
| GDACS RSS | `6,16,…,56` | 10 min | Global multi-hazard | `gdacs:<eventid>` |
| NASA EONET | `9,19,…,59` | 10 min | Global natural events | `eonet:<id>` |
| India alerts | `1,6,…,56` | — | GDACS India bbox + FloodList RSS | `gdacs-india-<id>-<episode>` |
| IMD (via Open-Meteo) | `*/30` | 30 min | 18 Indian monitoring cities | derived |
| NCS earthquakes | `2,7,…,57` | — | India, M ≥ 3.0 | derived |
| CWC floods | `15,45` | — | River stations via Open-Meteo GloFAS | `cwc-<station>-<peakDate>` |
| *cleanup* | `0 * * * *` | — | TTL deactivation | — |

**Every schedule is distinct** — no two pollers fire in the same minute.

### Why India earthquakes are special

USGS polls at M ≥ 4.0 globally; NCS polls at M ≥ 3.0 for India. Both would produce rows
for the same quake with different dedup hashes, creating duplicates. So the USGS poller
filters out anything inside the India bbox (lat 6–38, lon 68–98) and lets NCS own that
region at finer resolution.

### Why SACHET was abandoned

`services/india-alerts.js` documents it: SACHET (`sachet.ndma.gov.in`) has **no public
server-side API**. The CapFeed page is a client-side Next.js app; every
`/cap_public_website/*` endpoint returns 404. The replacement is GDACS's bounding-box API
plus FloodList's RSS feed. `services/sachet.js` remains in the tree as reference only and
**is not imported anywhere**.

> GDACS ignores the `bbox` query parameter, so `india-alerts.js` re-filters coordinates in
> JavaScript after fetching. The comment in the code says so.

### Enrichment, upsert and auto-alerting

For each batch, in windows of 10 concurrent events:

1. `resolveStateId(lat, lon)` — cached per ~1 km grid cell. The cache stores the
   **in-flight promise**, so ten events in the same cell issue exactly one RPC.
2. `calibrateSeverity(event)` — POSTs to ML `/classify/severity`. The result **only
   overrides** the source's severity when confidence ≥ 0.80 **and** it differs.
   Guarded by a circuit breaker (5 consecutive failures → open 5 min → one half-open
   trial). Without it, a sleeping Render dyno cost a 3 s timeout per event.
3. Coordinates that aren't finite are skipped rather than failing the batch.
4. `upsert(… , { onConflict: 'dedup_hash' })`, then `io.to('public').emit('events:updated')`.
5. Health snapshot recorded per source (`lastRun`, `lastCount`, `lastError`).

**Auto-alerting** fires only for `eventType === 'India'` rows that are `High`/`Critical`
**and** have `alerted_at IS NULL`. After dispatch the event is stamped with `alerted_at`,
so it can never be alerted twice. (This replaced a fragile
`updated_at − created_at < 1s` heuristic — migration 007.)

### TTL cleanup (hourly)

| Event types | Deactivated after |
|---|---|
| Earthquake, Tsunami, Landslide | 48 h |
| Wildfire | 72 h |
| everything else | 7 days |

---

## 7. Notification system

`services/notificationRouter.js` — `routeAlert(alert, channels, recipients)`.

| Channel | Provider | Degrades to |
|---|---|---|
| `email` | Resend | skip if no `RESEND_API_KEY` |
| `telegram` | Telegraf | skip if no bot token |
| `whatsapp` | Twilio | skip if no credentials |
| `sms` | Twilio | skip if no **`TWILIO_SMS_NUMBER`** |
| `web_push` | `web-push` + VAPID | skip if no VAPID keys |
| `multilingual` | LibreTranslate | returns the original text |

Every client is lazily constructed and every channel returns `{ skipped: true }` rather
than throwing when unconfigured. `routeAlert` returns a per-recipient result array, which
the alerts route writes into `alert_logs`.

**Security details worth knowing:**

- `escapeHtml()` is applied to title/body before they reach the HTML email and Telegram
  (which uses `parse_mode: 'HTML'`). Alert content can originate from external feeds or
  user input, so this prevents markup injection.
- The email subject strips `\r\n` — header-injection defence.
- SMS uses `TWILIO_SMS_NUMBER` **only**; it deliberately never falls back to the WhatsApp
  sandbox number.
- Translation is skipped entirely unless `LIBRETRANSLATE_URL` is set, avoiding a
  guaranteed connection failure to `localhost:5000` in production.

Supported translation languages: `hi, ta, te, bn, gu, mr, pa`.

---

## 8. ML service

FastAPI, four routers: `/predict`, `/classify`, `/optimize`, `/india`. CORS restricted by
the same `ALLOWED_ORIGINS` convention. `GET /health` and `GET /docs` (auto Swagger).

**The design principle is fallback-first: every heavy dependency is optional.**

| Module | Heavy dep | Fallback when missing |
|---|---|---|
| `prophet_service.py` | `prophet` | linear extrapolation via `np.polyfit` |
| `ortools_service.py` | `ortools` | greedy nearest-neighbour routing |
| `vision_service.py` | — (HTTP) | `{ available: false, reason }` |
| `sklearn_service.py` | **none** | n/a — pure rules |

Prophet is **deliberately commented out** of `requirements.txt`: it needs a C++ compiler
and Python ≤ 3.11. The service runs correctly without it.

### `sklearn_service.py` — despite the name, no ML

The file's own docstring says so. Two rule-based classifiers:

- **Severity** — per-event-type thresholds (Earthquake: M ≥ 7 Critical, ≥ 6 High, ≥ 5
  Medium; Wildfire by FRP: > 100 / 50 / 10 MW), falling back to a weighted combined score
  over wind speed, precipitation, area and population density.
- **Misinformation** — 8 regex patterns for panic/disinfo phrasing (`FAKE ALERT`,
  `government is hiding`, `share before deleted`, …) plus an 11-domain reliable-source
  allowlist (ndma.gov.in, imd.gov.in, usgs.gov, reuters.com, …). Two or more hits without
  a reliable source ⇒ `misinformation`; one hit ⇒ `suspicious`.

The HuggingFace path was removed from this file because it was unreachable dead code.

### `vision_service.py` — the only real model call

Downloads the image, POSTs the bytes to
`https://router.huggingface.co/hf-inference/models/{HF_MODEL}` (default
`microsoft/resnet-50`), then maps the top ImageNet label through `KEYWORD_RULES` to a
damage type and suggested severity:

| Keywords | Damage type | Severity |
|---|---|---|
| flood, water, lakeshore, seashore | `flood` | High |
| fire, flame, smoke, volcano | `fire` | Critical |
| collapse, rubble, ruin, wreck, debris | `structural_damage` | Critical |
| landslide, cliff, mudslide, avalanche | `landslide` | High |
| crack, damage, broken, pothole | `damage` | Medium |

It catches **every** exception and returns `available: false` — by contract it can never
raise.

### `india.py` — the India-specific domain logic

- **Flood:** Prophet-forecast 7 days, compare `max(yhat_upper)` against the CWC danger
  level: ≥ danger+1.0 Critical, ≥ danger High, ≥ danger−1.0 Medium.
- **Earthquake:** NDMA seismic-zone base score (V = 80, IV = 60, III = 40, II = 20) plus a
  Gutenberg–Richter-inspired penalty `Σ e^m × 0.1` over recent magnitudes ≥ 3.0, capped
  at 100.
- **Heatwave:** IMD definitions — anomaly ≥ 4.5 °C is a heatwave, ≥ 6.4 °C severe — with a
  sigmoid centred at 4.5 producing a probability.

### `ortools_service.py`

Haversine distance matrix in **integer metres** (OR-Tools requires integers), then a VRP
solve with a per-vehicle max-distance dimension.

---

## 9. Database

Supabase = PostgreSQL 15 + PostGIS + GoTrue auth + Realtime + Storage.

### Tables

| Table | Purpose | Key columns |
|---|---|---|
| `events` | Unified hazard stream | `dedup_hash` UNIQUE, `location` GEOGRAPHY(POINT), `state_id`, `is_active`, `alerted_at` |
| `alerts` | Outgoing broadcasts | `status` draft/sending/sent/failed, `channels[]`, `target_zone` POLYGON, `created_by` |
| `alert_logs` | Per-recipient delivery | `channel`, `recipient`, `delivered`, `error_msg` — **contains PII** |
| `resources` | Ambulances, shelters, teams | `type`, `status`, `quantity`, `location`, `state_id` |
| `incident_reports` | Citizen reports | `status`, `reporter_id`, `reporter_name`, `reporter_contact`, `ai_classification` JSONB |
| `sos_requests` | Emergency SOS | `status` active/acknowledged/resolved/cancelled, lat/lon + geography |
| `user_profiles` | Role + jurisdiction | `role`, `state_id`, `emergency_contacts` JSONB |
| `states` | 36 states/UTs | `code`, `capital`, 4 bbox columns |
| `audit_logs` | Accountability | `action_type`, `user_id`, `entity_id`, `metadata` |
| `push_subscriptions` | Web push | `endpoint` UNIQUE, `p256dh`, `auth`, `user_id` |
| `misinformation_checks` | Fact-check history | `credibility_score`, `classification`, `confidence` |

Every geography column has a **GIST** index. `sos_requests` additionally has a partial
index `(state_id, created_at DESC) WHERE status = 'active'` for the hot path.

### Stored functions

**`get_state_from_point(lat, lon) → UUID`** — bounding-box containment against `states`,
ordered by smallest bbox area so overlapping boxes resolve to the most precise match.
Returns `NULL` outside India. `SECURITY DEFINER`, granted to all roles.

**`get_nearest_safe_zones(lat, lon, limit) → TABLE`** — `ST_Distance` over the geography
type, filtered to available resources with `quantity > 0`, ordered by distance.

**`handle_new_user_unified()`** — the `AFTER INSERT ON auth.users` trigger. Creates the
`user_profiles` row (reading `full_name`, `role`, `state_id` from `raw_user_meta_data`)
and writes a `USER_SIGNUP` audit entry.

### Migration history

| # | What it does |
|---|---|
| 001 | Initial: events, alerts, resources, incident_reports, alert_logs + RLS + Realtime |
| 002 | `user_profiles` + auth trigger |
| 003 | `audit_logs` |
| 004 | Fix auth triggers |
| 005 | Schema patch |
| **006** | **Consolidation** — see below |
| 007 | `events.alerted_at` + `resources.state_id` (a gap the code already depended on) |
| 008 | RLS audit fixes, explicit grants |
| 009 | Reconcile drift: fix a CHECK-violating default, drop 3 stale trigger functions and over-permissive policies |
| 010 | **Security:** `REVOKE ALL FROM anon, authenticated`, then re-grant per `docs/rls_matrix.md` |
| 011 | `reporter_name`, `reporter_contact` |
| 012 | Trigger reads `state_id` from signup metadata |
| 013 | `incident-media` storage bucket + policies |
| 014 | SOS system: table, `emergency_contacts`, safe-zones RPC, RLS, Realtime |
| 015 | `incident_reports.ai_classification` JSONB |
| **016** | **(added by this audit)** Fix the safe-zone resource-type filter |

**Migration 006** is the pivot. Fully idempotent (`DO $$ … EXCEPTION WHEN duplicate_object`).
It seeds all 36 states with bounding boxes, creates `get_state_from_point`, adds `state_id`
to four tables, migrates the incident status vocabulary
(`pending`→`pending_review`, `verified`→`approved`), and collapses three competing
`on_auth_user_created` triggers into one.

### `schema.sql`

A flattened representation of the final schema, used to bootstrap a fresh database. CI
enforces that it matches the migrations exactly — see [§13](#13-testing--ci).

---

## 10. Frontend

### Routing and role redirection

| Route | Guard |
|---|---|
| `/` | `RoleHomeRedirect` → coordinator `/dashboard`, citizen `/citizen`, admin `/admin`, else `/landing` |
| `/landing`, `/login`, `/register` | public; Navbar hidden |
| `/portal` | public, but `RoleGuardedPortal` bounces staff to their own dashboard |
| `/citizen` | citizen, coordinator, admin |
| `/dashboard` | coordinator |
| `/admin`, `/admin/coordinators` | admin |

`ProtectedRoute` redirects a wrong-role user to **their own home** rather than showing a
dead-end 403.

### Code splitting

All pages except `LoginPage` are `React.lazy`, wrapped in one `<Suspense>`. `LoginPage`
stays eager because it is the most common cold entry point for signed-out users.

### State: one Zustand store

`store/useAppStore.js` holds events, alerts, resources, incidents, SOS, map view, filters,
UI panel state, language, connection status and a capped 50-item notification list. All
three live-data paths write into it, so every component reads one source of truth.

### Key components

| Component | Notes |
|---|---|
| `DisasterMap.jsx` | **Raw Leaflet, not react-leaflet.** Guards React 18 StrictMode double-invoke. Diffs markers incrementally via a `markersRef` id→marker map. Two independent geo filters: state-bbox click filter, and coordinator jurisdiction filter. |
| `GlobalEventFetcher` | Rendered once outside `<Routes>` so events survive navigation — fixes markers vanishing on route change. |
| `PushRegistrar` | Inside `<AuthProvider>`; re-subscribes push on sign-in. |
| `CoordinatorDashboard.jsx` | Wraps both panes in verbose `ErrorBoundary`s that render the stack into the DOM, and lazy-imports the inner dashboard so a module-load error surfaces in the boundary. |
| `SOSButton` / `SOSStatusBanner` / `NearestSafeZones` | Citizen emergency flow. |
| `ReportsQueue` | Coordinator triage, pre-filled by `ai_classification`. |
| `IngestionHealthPanel` | Renders `/api/events/ingestion-health`. |

### `useAuth` — a documented race fix

`setLoading(false)` now waits for `fetchProfile()` to resolve. Previously it fired first,
so `LoginPage` redirected with `role = null` and every user landed on `/portal`.

### PWA

`vite-plugin-pwa` in `injectManifest` mode over a hand-written `public/sw.js`:
network-first for navigations with an `/offline.html` fallback, cache-first for OSM tiles.
Manifest declares three shortcuts (Live Map, Coordinator Dashboard, Field Responder).
Web push via VAPID.

### Zero-key external APIs used directly from the browser

Open-Meteo (weather), OSRM (routing, **lon,lat order**), Nominatim (geocoding,
self-throttled to 1 req/s with a `User-Agent`), OpenStreetMap tiles.

---

## 11. Real-time layer

### Socket.io rooms

`io.use()` verifies the handshake token before connection; an absent token joins as
anonymous. On connect, a socket joins up to four rooms:

```
public          every client
role:<role>     role:coordinator, role:admin, role:responder
state:<uuid>    the coordinator's state
user:<uuid>     that individual
```

**Every emit is room-targeted — there is no bare `io.emit` anywhere.**

| Event | Room | Meaning |
|---|---|---|
| `events:updated` | `public` | An ingestion batch landed |
| `new_incident` | `state:<id>` | Citizen filed a report |
| `incident_classified` | `state:<id>` | Vision result attached |
| `sos:new` | `state:<id>` + `role:admin` + `role:responder` | SOS raised |
| `sos:acknowledged` | `user:<id>` | Help is coming (with ETA) |
| `sos:resolved` | `user:<id>` | Resolved |
| `sos:cancelled` | `state:<id>` + `role:admin` | Citizen cancelled |

The server exposes the instance via `app.set('io', io)`; routes read it with
`req.app.get('io')` and tolerate its absence.

### Supabase Realtime

Publication on `events`, `alerts`, `sos_requests`. The frontend subscribes to
`postgres_changes` INSERT as a second path that catches writes the backend didn't make.

---

## 12. Caching

**Two layers.**

**Upstash Redis** (`services/cacheService.js`) — wraps upstream fetches with
`fetchWithCache(key, ttl, fn)`. If `UPSTASH_REDIS_REST_URL`/`TOKEN` are unset, it silently
becomes a pass-through. Read/write failures are logged and ignored.

**In-memory response cache** (`middleware/cache.js`) — `node-cache`, GET only.

```js
__express__<scope>__<originalUrl>
```

where scope is `coordinator:<stateId>` · `admin` · `citizen` · `responder` · `anon`.

**The scope segment is mandatory.** `/api/events` and `/api/events/stats/summary` filter
by `req.userStateId`, so a URL-only key served one state's data to another. The scope is
derived only from server-resolved values (set by `stateScope` after verifying the JWT), so
it cannot be spoofed via a header to poison or read another tenant's entry.

Only **2xx** responses are cached — otherwise a transient upstream 500 would be replayed
for the full TTL, turning a blip into an outage.

| Route | TTL |
|---|---|
| `/api/events` | 30 s |
| `/api/events/stats/summary` | 60 s |
| `/api/admin/stats` | 30 s |
| `/api/states` | 1 h |

`flushCache(substring)` drops every key containing a substring.

---

## 13. Testing & CI

### Test suites

| Suite | Runner | Count |
|---|---|---|
| Backend unit | Jest + supertest | **62** |
| Frontend | Vitest + Testing Library | **9** |
| ML | pytest | **14** |
| Backend integration | plain Node scripts | RLS, smoke, e2e incident |

Backend tests mock `../src/lib/db` with a chainable stub — **this is the convention**;
mocking `@supabase/supabase-js` directly no longer works now that routes use the
singletons.

`backend/tests/security.test.js` (added by this audit) holds 16 regression tests covering
tenancy scoping, cache isolation and PII exposure.

### CI — `.github/workflows/ci.yml`, four jobs

1. **backend** — lint → spin up a **real local Supabase stack** (Postgres 15 + auth
   schema) → apply migrations → unit tests → integration tests → **schema-drift guard**.
2. **frontend** — lint → `vitest run` → `vite build` with placeholder env vars.
3. **ml-service** — install deps → `python -c "from app.main import app"` import smoke.
4. **secret-scan** — `git grep` for leaked credentials (service-role JWTs, Stripe live
   keys, Resend keys, Twilio account SIDs) outside example/lock/workflow files.

   > This document deliberately paraphrases those patterns rather than quoting them. The
   > scan greps **all tracked files**, so writing a pattern out verbatim in prose makes the
   > file match itself and fails the job.

### The schema-drift guard

Unusually thorough for a project this size:

1. DB **A** = the database `supabase start` produced by applying `migrations/`.
2. DB **B** = a fresh database with `schema.sql` applied over an auth stub.
3. `pg_dump --schema-only` both, strip comments/`SET`/`\restrict` lines, `diff -u`.
4. Any difference fails the build.

> **This means `supabase/schema.sql` and `supabase/migrations/` must always be changed
> together.** Migration 016 was written to be byte-identical to the corresponding block in
> `schema.sql` for exactly this reason.

No hosted project is contacted and no secrets are needed; the well-known local-stack JWTs
are hardcoded in the workflow.

---

## 14. Deployment

| Component | Host | Config |
|---|---|---|
| Frontend | Vercel | auto-deploy on `main`; `frontend/vercel.json` |
| Backend | Render web service | `render.yaml`, rootDir `backend`, `npm run start` |
| ML | Render web service | rootDir `ml-service`, uvicorn on `$PORT` |
| LibreTranslate | Render | `libretranslate/Dockerfile` |
| Database | Supabase cloud | migrations applied via SQL editor or CLI |

All secrets are `sync: false` in `render.yaml` — set manually in the dashboard.

**Free-tier constraint:** the ML keep-alive ping is deliberately **disabled and commented
out** in `apiPollers.js`, because two services pinging 24/7 would consume 1,440 hours
against Render's 750-hour free allowance. The consequence is that the ML dyno sleeps —
which is precisely why the severity circuit breaker matters.

### Environment variables

**Backend:** `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_KEY`, `ML_SERVICE_URL`, `FIRMS_API_KEY`, `RESEND_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_NUMBER`,
`TWILIO_WHATSAPP_NUMBER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LIBRETRANSLATE_URL`, `SENTRY_DSN`,
`DEFAULT_TELEGRAM_CHAT_ID`, `DEFAULT_WHATSAPP_NUMBER`, `DEFAULT_SMS_NUMBER`

**Frontend (`VITE_` = public, never secret):** `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`, `VITE_ML_SERVICE_URL`,
`VITE_VAPID_PUBLIC_KEY`, `VITE_SENTRY_DSN`

**ML:** `PORT`, `ALLOWED_ORIGINS`, `HF_API_TOKEN`, `HF_VISION_MODEL`

> `SUPABASE_SERVICE_KEY` bypasses RLS. It must never appear in any `VITE_`-prefixed
> variable or reach the browser.

---

## 15. Running it locally

```bash
# 1. Infrastructure
supabase start
docker run -d --name civicshield-redis -p 6379:6379 redis:alpine
docker run -d --name libretranslate -p 5000:5000 \
  -e LT_LOAD_ONLY=en,hi,ta,te,bn,gu,mr libretranslate/libretranslate

# 2. Env
cp .env.example backend/.env
cp .env.example frontend/.env.local

# 3. Services (three terminals)
cd backend    && npm install && npm run dev            # :4000
cd ml-service && uvicorn app.main:app --reload --port 8000
cd frontend   && npm install && npm run dev            # :3000
```

Vite proxies `/api` → `localhost:4000`.

```bash
cd backend    && npm test        # 62
cd frontend   && npm run test:ci # 9
cd ml-service && pytest          # 14
```

---

## 16. Audit: everything fixed

27 files changed. Every item below was verified by test, by boot, or by re-running the
audit script that found it.

### A. Cross-tenant security (6 defects)

All the same class: **role-gated but not state-scoped**, so any coordinator could act on
any state's rows. Silent failures — no error, no audit trail.

| # | Where | Was | Now |
|---|---|---|---|
| 1 | `PATCH /api/resources/:id` | **No authentication at all** — anyone could reassign or relocate any resource | 401/403 gate + state-scoped update |
| 2 | `DELETE /api/resources/:id` | Role-gated, not scoped | State-scoped |
| 3 | `PATCH /api/sos/:id/acknowledge` | Selected `state_id` and **never used it** | Coordinators state-scoped |
| 4 | `PATCH /api/sos/:id/resolve` | Didn't even select `state_id` | Selects and enforces it |
| 5 | `PATCH /api/events/:id/deactivate` | Not scoped | State-scoped |
| 6 | `DELETE /api/alerts/:id` | Not scoped | State-scoped |

(3) is the most consequential: a coordinator in one state could acknowledge another
state's SOS, flipping it out of the owning state's active queue while nobody with local
responders was actually on it.

### B. The cache tenancy leak

`cacheMiddleware` keyed on `req.originalUrl` alone, while `/api/events` and
`/api/events/stats/summary` filter by `req.userStateId`. A Maharashtra coordinator's
response was stored under `__express__/api/events` and served verbatim to a Kerala
coordinator hitting the identical URL.

Fixed by including a server-derived scope segment in the key. Also: non-2xx responses are
no longer cached.

### C. PII exposure (2 defects)

| Where | Exposed |
|---|---|
| `GET /api/alerts/:id` | Returned `*, alert_logs(*)` to **anyone, unauthenticated** — `alert_logs.recipient` holds the email address, phone number or Telegram chat id of every alert recipient |
| `GET /api/incidents/:id` | **No auth at all** while returning `reporter_name`, `reporter_contact` and the reporter's exact coordinates |

Now: delivery logs only for coordinators (own state) and admins; incident detail requires
auth and matches the list endpoint's rule (owner / coordinator-of-state / admin /
responder).

### D. Unauthenticated write + compute

`POST /api/predictions/misinformation` is public, burns ML compute **and INSERTs a row**
per call — a DB-flooding and cost-amplification vector. It must stay public (the portal's
Fact-Check tab), so it now carries `strictLimiter` (30/15 min). The four other public
prediction endpoints carry `standardLimiter`.

`GET /misinformation/history` returned other people's submitted text in full to anonymous
callers; non-privileged callers now get a 120-char preview.

> `middleware/rateLimiter.js` already exported these limiters — **nothing had ever
> imported it.** The module was dead code.

### E. The `TEST_TOKEN` backdoor

`middleware/auth.js` was never imported anywhere, and contained:

- `requireAuth`: `Authorization: Bearer TEST_TOKEN` granted the **coordinator** role with
  no environment guard.
- `optionalAuth`: referenced an undeclared `authHeader` — a guaranteed `ReferenceError` on
  every call.
- Both constructed a Supabase client per request.

Rewritten: backdoor removed, `ReferenceError` fixed, singletons used, and a `requireRole()`
helper added. It reuses `req.userId` when `stateScope` already resolved it, so the common
path costs no extra network call.

### F. Database: safe-zone type mismatch (migration 016)

`get_nearest_safe_zones` searched for `'hospital'`, `'relief_camp'`, `'rescue'` — none of
which the API can create — while omitting `'rescue_team'` and `'water'`, which it can.
Three of six predicates were dead, and a deployed rescue team never appeared in an SOS
victim's nearest-safe-zones list, silently narrowing results to shelter/medical/food.

**Also fixed a latent runtime break:** the copy of this function in `schema.sql` was
missing the `::TEXT` casts that migration 014 has. `resources.name` is `VARCHAR(200)` while
`RETURNS TABLE` declares `TEXT`, so the uncast version raises *"structure of query does not
match function result type"* at call time. Anyone bootstrapping from `schema.sql` would
have had a completely broken SOS safe-zone lookup. Both files now carry the casts and are
byte-identical, keeping the CI drift guard green.

### G. Attribution

`alerts.created_by` has existed since migration 001 but **nothing ever populated it**, and
the audit entry hardcoded `null`. There was no record of which coordinator sent any given
emergency broadcast. Both now record `req.userId`.

### H. Performance

| Change | Effect |
|---|---|
| **Ingestion parallelised** | Was fully serial: one state RPC + one 3 s ML call awaited per event. A ~300-hotspot FIRMS batch serialized into minutes and could overrun its own interval. Now runs in bounded windows of 10. |
| **ML circuit breaker** | On Render's free tier the ML dyno sleeps, so a 3 s timeout *per event* was the normal case. Opens after 5 consecutive failures for 5 min, with a half-open trial. |
| **State-RPC promise cache** | Caches the in-flight promise, so N events in one grid cell issue exactly one RPC even when concurrent. |
| **Cron collision** | USGS and India alerts both ran at `*/5`, doubling peak load every fifth minute. India moved to `1,6,11,…`. All 9 schedules now distinct. |
| **`createClient()` per request** | `events.js`, `states.js`, `admin.js` still opened a new connection per request. All now use the singletons. *Side effect: backend test suite went 16.8 s → 2.7 s.* |
| **`/api/admin/stats`** | Pulled **every row** of events, alerts and incident_reports into Node to call `.length`. Now `head:true` + `count:'exact'` (zero rows over the wire) for totals; breakdown queries select only their grouping columns. Cached 30 s. |
| **`/api/states`** | Static reference data hit the DB on every page load. Cached 1 h. |
| **Frontend code splitting** | One 1.08 MB chunk → 683 KB shared + per-route chunks. Leaflet (257 KB) now loads only on map routes. |
| **10 unused dependencies removed** | frontend: `@turf/turf`, `chart.js`, `jspdf`, `jspdf-autotable`, `leaflet.heat`, `leaflet.markercluster`, `react-chartjs-2`, `xlsx`; backend: `feedparser-promised`, `uuid` — imported nowhere. |
| **Duplicate EWKB parser** | `parseWkbPoint` was copy-pasted byte-identically into `events.js`; now imports the single source in `utils/geoHelpers.js`. |
| **Push subscription** | See below. |

### I. Push notifications were broken

`pushService.js` posted the subscription with a bare `fetch()` and **no Authorization
header**, so `req.userId` was always `null` and every row landed with `user_id = NULL`.
Push could only ever broadcast to everyone — never to a state or an individual.

Three fixes: it now goes through `backendApi` (which attaches the JWT); registration moved
inside `<AuthProvider>` as `<PushRegistrar>` so it reacts to sign-in (previously it fired
once at mount, always *before* login); and an existing subscription is reused rather than
re-created on every load.

### J. Code quality

- Backend lint: **12 warnings → 0**. Unused imports removed; the two intentional empty
  `catch` blocks in `/health` now carry comments explaining the contract; ESLint configured
  for the `_`-prefix convention.
- `services/cwc.js` built a `desc` string naming the river, station, state and threshold —
  then never used it, while the `description` field rebuilt a less informative duplicate.
  Now uses `desc`.
- Pydantic V2: `.dict()` → `.model_dump()` (removed in V3). ML warnings 10 → 3.

### K. Tests

**49 → 62 backend tests.** New `security.test.js` (16 tests) covers tenancy scoping, cache
isolation, non-2xx caching and PII exposure.

Three pre-existing tests **asserted the vulnerable behaviour** and were corrected:

| Test | Was asserting |
|---|---|
| `alerts.test.js` — "200 when called by a coordinator" | A **stateless** coordinator could delete any state's alert |
| `incidents.test.js` — "200 with incident data" | `GET /incidents/:id` returns PII **unauthenticated** |
| `events.test.js` | Mocked `@supabase/supabase-js` instead of `lib/db` |

### L. Dependency vulnerabilities

Audited after removing unused packages. **Only semver-compatible fixes were applied** —
nothing that required a breaking major bump was touched.

| | Before | After |
|---|---|---|
| Backend (production) | **17** — 2 critical, 6 high, 7 moderate, 2 low | **4** — 2 moderate, 2 low |
| Frontend (production) | **8** — 5 high, 3 moderate | **2** — 2 moderate |

**Both backend criticals came from one unused dependency.** `feedparser-promised` is
imported nowhere (all RSS parsing uses `xml2js`), yet it was the sole path to the
long-deprecated `request@2.88.0`, which drags in `form-data` (critical), `tough-cookie`,
`qs` and `uuid`. Removing it eliminated 6 vulnerabilities including both criticals, at
zero code risk. `uuid` was also removed as a direct dependency — the code uses
`crypto.randomUUID()`.

The high-severity fixes were memory-exhaustion DoS issues in `ws` and `socket.io-parser`,
which sit directly in this platform's realtime path. Patched versions: `ws` 8.21.0
(advisory covered ≤ 8.20.1), `socket.io-parser` 4.2.7 (≤ 4.2.6). No direct dependency
version in `package.json` changed — only transitive resolutions — so no API surface moved.

Resulting direct-dependency bumps: `axios` 1.20.0, `express` 4.22.3 (still v4),
`socket.io` 4.8.3.

Verified on the actually-installed tree, not just the lockfile: backend 62 tests + lint
clean + boots with `/health` 200; frontend 9 tests + clean build with the removed packages
physically absent from `node_modules`.

### Verification

Four full audit iterations were run. The final two found no new issues.

```
backend lint      0 issues
backend tests     62 passed
backend boot      HEALTH 200
frontend tests     9 passed
frontend build    ✓
ml tests          14 passed
```

---

## 17. Known remaining issues

Things I found but deliberately did **not** change, with the reasoning.

### 1. The 3D globe is dead code

`LandingPage.jsx` imports `Canvas`, `useFrame`, `useLoader`, `Stars`, `OrbitControls` and
`TextureLoader`, and defines `GlobeRenderer`, `GlobeScene`, `GlobeErrorBoundary` and
`CSSGlobeFallback` — but **`GlobeRenderer` is never rendered**. The page shows a static
`<img src="/textures/custom_planet.png">` instead.

Rollup tree-shakes it, so verified: **no three.js symbol appears in any built chunk** —
it costs users nothing today. But `three`, `@react-three/fiber` and `@react-three/drei`
remain installed (tens of MB, slower installs and CI).

I left them because the top-level imports are still present, so removing the packages
would break the build immediately — and deleting the 3D globe implementation is a product
decision, not a cleanup. **Your call:** if the 3D globe isn't coming back, delete the
components and imports, then `npm uninstall three @react-three/fiber @react-three/drei`.

> I told you earlier that three.js was shipping on every route. That was wrong — it is
> tree-shaken and never reaches users. The code-splitting win was real but came from
> Leaflet and the per-role page bundles, not three.js.

### 2. Two dead backend modules

- `services/sachet.js` — superseded by `india-alerts.js`, imported nowhere. Kept as
  documentation of why SACHET doesn't work.
- `services/openMeteo.js` — a complete, working weather wrapper that nothing imports.

Harmless; both are plausible future utilities.

### 3. 305 frontend lint warnings

Almost entirely unused imports and JSX identifiers ESLint can't see because
`eslint-plugin-react` isn't configured. Zero errors, zero bundle impact (tree-shaken).
Fixing means touching nearly every file for cosmetic gain. The real fix is adding
`eslint-plugin-react` + `react-hooks` so the false positives disappear.

### 4. `@supabase/supabase-js` version skew

Backend pins `2.43.4`; frontend and root use `^2.108.2`/`^2.43.4`. Not currently breaking,
but worth aligning.

### 5. `docs/rls_matrix.md` is mostly "Untested"

Only `incident_reports` and `alert_logs` rows are marked verified. The integration suite
(`tests/integration/rls.test.js`) covers a subset. Since the API bypasses RLS via
service_role, these policies only guard direct-from-browser Supabase access — which the
frontend genuinely does use for `user_profiles` and Realtime, so the gap is real.

### 6. Migration 016 is unverified against a live database

I could not run Docker/Supabase locally, so the CI schema-drift guard hasn't executed
against it. I verified by construction: the function body in
`016_fix_safe_zone_resource_types.sql` is **byte-identical** to the corresponding block in
`schema.sql`, and both use `CREATE OR REPLACE`, so both databases converge to the same
definition. Still, watch that CI job on the first push.

### 7. Remaining vulnerabilities need breaking changes

Six remain (4 backend, 2 frontend). All require a major-version bump, which is a migration,
not a patch — so I left them:

| Package | Severity | Needs |
|---|---|---|
| `react-router` / `react-router-dom` | moderate ×2 | v6 → v7, a real migration |
| `node-cron` | moderate | v3 → v4, API changes |
| `@supabase/supabase-js` (backend) | low | pinned at `2.43.4` while the frontend is on `^2.108.2` — align these first |

None are remotely exploitable in this deployment shape as far as I can tell, but they
should be scheduled.

### 8. `push_subscriptions` has no cleanup

Browsers expire push endpoints. `web-push` returns 410/404 for dead ones, and
`sendWebPush` counts failures but never deletes them, so the table grows monotonically and
every broadcast retries dead endpoints. A cleanup pass on 410 would be a good follow-up.

---

## 18. Glossary of project conventions

| Convention | Meaning |
|---|---|
| **`m1`, `B5`, `N2`, `C2`, `E1`, `S7` in comments** | Ticket IDs from the project's own audit rounds (`CODE_REVIEW_*.md`, `PHASE1_TICKETS.md`). Each marks a specific past fix. |
| **`dedup_hash`** | Per-source natural key making ingestion idempotent. Always `ON CONFLICT`. |
| **`demo: true`** | This response contains synthetic fallback data, not real measurements. |
| **`available: false`** | An ML feature degraded gracefully; caller should carry on. |
| **`{ skipped: true }`** | A notification channel isn't configured. Not an error. |
| **`SRID=4326;POINT(lon lat)`** | PostGIS WKT input format. **Longitude first.** OSRM also takes lon,lat; Leaflet takes lat,lon. |
| **EWKB hex** | What Supabase's REST API returns for geography columns. Decode with `parseWkbPoint`. |
| **Route ordering** | Literal paths (`/mine`, `/stats/summary`) must be declared **before** `/:id`. |
| **`getAdminDb` vs `getAnonDb`** | admin = service_role, bypasses RLS, backend only. anon = respects RLS, used for JWT verification. |

---

## Appendix — where to look first

| I want to… | Read |
|---|---|
| Understand authorization | `middleware/stateScope.js`, then any route's guard block |
| Add a new data source | `services/usgsEarthquake.js` (simplest), then register in `cron/apiPollers.js` |
| Understand the map | `components/map/DisasterMap.jsx` |
| Trace an SOS end to end | `routes/sos.js` → `migrations/014` → `components/sos/` |
| Change the DB | Write a migration **and** update `schema.sql` (CI enforces they match) |
| Add a cached endpoint | `middleware/cache.js` — check whether the response is tenant-specific |
| Add a write endpoint | Copy the guard block from `routes/resources.js` PATCH: authn → authz → tenancy-on-the-write |
