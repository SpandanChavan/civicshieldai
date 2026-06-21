# CivicShield AI — Complete Project Documentation

> Intelligent, real-time disaster management platform focused on India, built on a global hazard backbone.
> This document is the single source of truth for what the project is, why it exists, how it is built, and how every part works.

---

## Table of Contents

1. [What this project is](#1-what-this-project-is)
2. [Why we are building it (problem & motivation)](#2-why-we-are-building-it)
3. [Who uses it (roles & personas)](#3-who-uses-it)
4. [High-level architecture](#4-high-level-architecture)
5. [Technology stack](#5-technology-stack)
6. [Repository layout](#6-repository-layout)
7. [External data sources](#7-external-data-sources)
8. [Backend (Node/Express) — detailed](#8-backend-nodeexpress--detailed)
9. [ML service (FastAPI/Python) — detailed](#9-ml-service-fastapipython--detailed)
10. [Database (Supabase/PostgreSQL + PostGIS) — detailed](#10-database--detailed)
11. [Frontend (React/Vite) — detailed](#11-frontend-reactvite--detailed)
12. [Real-time architecture](#12-real-time-architecture)
13. [Notifications & multi-channel alerting](#13-notifications--multi-channel-alerting)
14. [Authentication, roles & access control](#14-authentication-roles--access-control)
15. [Configuration & environment variables](#15-configuration--environment-variables)
16. [Local development & deployment](#16-local-development--deployment)
17. [End-to-end data flows](#17-end-to-end-data-flows)
18. [Known issues & technical debt](#18-known-issues--technical-debt)
19. [Glossary](#19-glossary)

---

## 1. What this project is

CivicShield AI is a disaster management platform that continuously ingests hazard data from multiple authoritative sources (earthquakes, wildfires, floods, cyclones, heatwaves, etc.), normalizes it into a single event model, stores it geospatially, and surfaces it in real time to three audiences: the general public, state-level disaster coordinators, and national administrators. On top of the raw feed it layers AI/analytics services for risk forecasting, severity classification, misinformation screening, and emergency resource/route optimization, plus a multi-channel alerting system (web push, Telegram, WhatsApp, SMS, email).

It is structured as a **three-service monorepo**:

- **`backend/`** — a Node.js/Express API + Socket.io server that polls external data sources on a schedule, persists events, exposes a REST API, brokers real-time updates, and dispatches alerts.
- **`ml-service/`** — a Python/FastAPI microservice providing forecasting (Prophet), classification (rule-based), and optimization (Google OR-Tools).
- **`frontend/`** — a React (Vite) single-page app with live maps, dashboards, citizen reporting, and admin tooling.
- **`supabase/`** — SQL migrations defining the PostgreSQL + PostGIS schema, row-level security, and helper functions.

---

## 2. Why we are building it

India is one of the most disaster-prone countries in the world: earthquakes along the Himalayan belt (BIS seismic zones IV–V), recurrent monsoon flooding across the Brahmaputra/Ganga/Godavari basins, cyclones on both the Bay of Bengal and Arabian Sea coasts, heatwaves across the northern plains, and landslides in the hill states. Authoritative data exists but is **fragmented and largely lacks public APIs** (e.g., NDMA's SACHET, IMD, NCS, and CWC portals are either client-rendered or closed), so situational awareness is hard to assemble in one place and in real time.

The project's goals:

- **Unify** disparate hazard feeds into one normalized, deduplicated, geospatial event stream.
- **Localize** to India using region-specific proxies for the closed government feeds (USGS India bbox as an NCS proxy, Open-Meteo/GloFAS as CWC and IMD proxies, GDACS India bbox, FloodList RSS).
- **Act in real time** — push updates to connected clients within seconds and auto-dispatch alerts for high-severity India events.
- **Add intelligence** — forecast near-term risk, score severity, flag misinformation during crises, and optimize how limited rescue resources are routed and allocated.
- **Serve every stakeholder** — a public portal for citizens, a scoped operational dashboard for state coordinators, and a national oversight view for admins.

---

## 3. Who uses it

| Role | Access | What they do |
|------|--------|--------------|
| **Public / Guest** | No login | View the public portal: live map of active events, public (sent) alerts, resources. |
| **Citizen** | Authenticated (`role = citizen`) | Submit incident reports (with location + media), view their own reports, receive alerts. |
| **Coordinator** | Authenticated (`role = coordinator`), assigned a `state_id` | State-scoped operations: review/approve/reject incident reports in their state, create & send alerts, manage resources, view state events. |
| **Responder** | `role = responder` | Field role recognized by the schema/RLS for read access to reports (operational extension of coordinator). |
| **Admin** | Authenticated (`role = admin`) | Nationwide oversight: aggregate stats, manage users & coordinator↔state assignments, read audit logs, unrestricted reads. |

Roles live in `user_profiles.role`; coordinators/admins are scoped by `user_profiles.state_id`.

---

## 4. High-level architecture

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                     External Data Sources                │
                 │  USGS · NASA FIRMS · GDACS · NASA EONET · Open-Meteo     │
                 │  (GloFAS flood, weather) · FloodList RSS · NCS-via-USGS  │
                 └───────────────┬─────────────────────────────────────────┘
                                 │  (scheduled polling via node-cron)
                                 ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  BACKEND  (Node.js / Express / Socket.io)                              │
   │  • cron/apiPollers.js  → fetch, normalize, dedup, resolve state_id     │
   │  • services/*          → one module per data source                    │
   │  • routes/*            → REST API (events, alerts, resources,          │
   │                          incidents, predictions, states, admin)        │
   │  • middleware/*        → stateScope (JWT→role/state), rate limit, etc. │
   │  • notificationRouter  → email/telegram/whatsapp/sms/web-push          │
   └──────┬───────────────────────────┬─────────────────────────┬──────────┘
          │ upsert/read               │ proxy ML calls          │ realtime
          ▼                           ▼                         ▼
   ┌─────────────┐          ┌──────────────────┐      ┌──────────────────┐
   │  SUPABASE   │          │  ML SERVICE      │      │  Socket.io rooms │
   │  Postgres + │          │  (FastAPI)       │      │  public / role:* │
   │  PostGIS    │          │  Prophet·OR-Tools│      │  / state:*       │
   │  + RLS      │          │  rule classifiers│      └──────────────────┘
   └──────┬──────┘          └──────────────────┘
          │ Realtime (postgres_changes) + REST
          ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  FRONTEND  (React / Vite)                                              │
   │  • TanStack Query (REST) + Supabase Realtime + Socket.io (redundancy)  │
   │  • Zustand store · Leaflet maps · Three.js · Chart.js · framer-motion  │
   │  • Pages: Landing, Login/Signup, PublicPortal, CitizenPortal,         │
   │    CoordinatorDashboard, AdminDashboard, AdminCoordinators            │
   └──────────────────────────────────────────────────────────────────────┘
```

**Why three real-time channels?** The frontend listens via (a) TanStack Query polling (REST fallback), (b) Supabase Realtime `postgres_changes` on the `events` table, and (c) Socket.io `events:updated` pushes from the backend cron. This "triple redundancy" keeps the live map fresh even if one channel degrades.

---

## 5. Technology stack

**Backend**
- Node.js ≥ 20, Express 4
- Socket.io 4 (real-time), `ws` (WebSocket polyfill)
- `@supabase/supabase-js` (DB access via service-role + anon keys)
- `node-cron` (scheduling), `axios` + `axios-retry` (HTTP), `xml2js` / `feedparser-promised` (RSS/XML)
- `@upstash/redis` (caching), `zod` (validation), `helmet` + `express-rate-limit` (security)
- Notifications: `resend` (email), `telegraf` (Telegram), `twilio` (SMS/WhatsApp), `web-push` (browser push)
- `@sentry/node` (+ profiling) for error monitoring

**ML service**
- Python, FastAPI, Uvicorn (implied), Pydantic
- `prophet` (forecasting, with linear-regression fallback), `numpy`, `pandas`
- `ortools` (vehicle routing / allocation, with greedy fallback)
- `httpx` (HTTP)

**Frontend**
- React 18 + Vite 5, React Router 6
- TanStack React Query 5 (server state), Zustand 4 (client store)
- Leaflet + markercluster + heat (maps), Three.js + react-three-fiber/drei (3D), Chart.js + react-chartjs-2 (charts)
- framer-motion (animation), `@turf/turf` (geo math), jspdf + xlsx (exports)
- socket.io-client, `@supabase/supabase-js`, `@sentry/react`, vite-plugin-pwa (installable PWA)

**Data / infra**
- Supabase (PostgreSQL + PostGIS + Auth + Realtime + RLS)
- Upstash Redis (serverless cache)
- Designed for Render-style hosting (keep-alive ping logic present but disabled to respect free-tier hours)

---

## 6. Repository layout

```
civicshield-ai/
├─ backend/
│  ├─ src/
│  │  ├─ app.js                     # Express+Socket.io entry, CORS, routes, health, cron bootstrap
│  │  ├─ cron/apiPollers.js         # Scheduled polling, upsert, dedup, state_id resolve, auto-alert, cleanup
│  │  ├─ routes/
│  │  │  ├─ events.js               # GET events (+diverse mode, WKB→lat/lon), stats, deactivate
│  │  │  ├─ alerts.js               # CRUD alerts, push subscribe, async multi-channel dispatch
│  │  │  ├─ resources.js            # CRUD emergency resources
│  │  │  ├─ incidents.js            # Citizen reports + coordinator review workflow
│  │  │  ├─ predictions.js          # Proxies to ML service with real source data
│  │  │  ├─ states.js               # List Indian states
│  │  │  └─ admin.js                # Admin stats, users, coordinators, audit logs
│  │  ├─ middleware/
│  │  │  ├─ stateScope.js           # Verifies JWT → sets req.userId/userRole/userStateId
│  │  │  ├─ auth.js                 # requireAuth / optionalAuth helpers
│  │  │  ├─ requestLogger.js        # requestId + structured request log
│  │  │  ├─ errorHandler.js         # Centralized JSON error handler
│  │  │  ├─ rateLimiter.js          # Rate-limit helpers
│  │  │  ├─ validator.js            # Zod validation helpers
│  │  │  └─ cache.js                # In-memory response cache middleware (events)
│  │  ├─ services/
│  │  │  ├─ usgsEarthquake.js       # USGS FDSN global earthquakes
│  │  │  ├─ nasaFirms.js            # NASA FIRMS VIIRS fire hotspots (India bbox)
│  │  │  ├─ gdacs.js                # GDACS RSS (global) + NASA EONET
│  │  │  ├─ india-alerts.js         # GDACS India bbox + FloodList RSS (India filter)
│  │  │  ├─ imd.js                  # Weather hazards via Open-Meteo (heat/cold/rain/cyclone)
│  │  │  ├─ ncs.js                  # India earthquakes via USGS India bbox + BIS zone logic
│  │  │  ├─ cwc.js                  # River flood via Open-Meteo GloFAS, 18 gauge stations
│  │  │  ├─ notificationRouter.js   # Multi-channel alert dispatch + translation
│  │  │  └─ cacheService.js         # Upstash Redis cache-then-fetch
│  │  ├─ lib/db.js                  # Supabase client singletons (admin + anon)
│  │  └─ utils/
│  │     ├─ axiosClient.js          # axios instance with retry
│  │     └─ auditLogger.js          # Writes to audit_logs
│  ├─ tests/ (target)               # Jest + Supertest (mocked) suites
│  └─ package.json
├─ ml-service/
│  └─ app/
│     ├─ main.py                    # FastAPI app, CORS, router registration, /health
│     ├─ routers/{predict,classify,optimize,india}.py
│     └─ services/{prophet_service,sklearn_service,ortools_service}.py
├─ frontend/
│  ├─ index.html                    # PWA shell, fonts, manifest
│  └─ src/
│     ├─ main.jsx                   # React root + Sentry
│     ├─ App.jsx                    # Router, role guards, global event fetcher
│     ├─ pages/                     # Landing, Login, Signup, PublicPortal, CitizenPortal,
│     │                             #   CoordinatorDashboard, AdminDashboard, AdminCoordinators
│     ├─ components/shared/         # Navbar, ProtectedRoute, PWAInstallBanner, …
│     ├─ hooks/{useAuth,useDisasterEvents}.* 
│     ├─ services/{supabaseClient,backendApi}.js
│     ├─ store/useAppStore.js       # Zustand global store
│     └─ utils/{pushService,formatDate}.js
└─ supabase/
   └─ migrations/001…006*.sql       # Schema, RLS, triggers, functions, seed
```

---

## 7. External data sources

| Source | Service file | What it provides | Key needed | India strategy |
|--------|--------------|------------------|------------|----------------|
| **USGS FDSN** | `usgsEarthquake.js`, `ncs.js` | Earthquakes (geojson) | No | NCS proxy = USGS query bounded to India bbox (68–98°E, 6–38°N), 3.0+ mag, BIS seismic-zone lookup |
| **NASA FIRMS** | `nasaFirms.js` | VIIRS fire hotspots (CSV) | `FIRMS_API_KEY` | India bbox 68,8,97,37 |
| **GDACS** | `gdacs.js`, `india-alerts.js` | Global multi-hazard RSS + India bbox event list | No | Dedicated India bbox API query |
| **NASA EONET** | `gdacs.js` | Open natural events | No | Global; normalized categories |
| **Open-Meteo (weather)** | `imd.js`, `predictions.js` | Forecast temps, precip, wind | No | IMD proxy; 18 Indian monitoring cities |
| **Open-Meteo Flood (GloFAS)** | `cwc.js`, `predictions.js` | River discharge forecasts | No | CWC proxy; 18 river gauge stations |
| **FloodList RSS** | `india-alerts.js` | India-tagged flood news | No | Keyword filter to Indian states |

**Why proxies?** As documented in `india-alerts.js` and `ncs.js`/`cwc.js`/`imd.js`: SACHET has no server-side API (client-rendered Next.js), and NCS/IMD/CWC portals are closed. GloFAS (which CWC itself uses) and USGS (authoritative seismic data covering India) are open substitutes, attributed accordingly.

---

## 8. Backend (Node/Express) — detailed

### 8.1 Entry point — `src/app.js`
- Loads env, polyfills global WebSocket, conditionally initializes Sentry (if `SENTRY_DSN`).
- Creates Express app + HTTP server + Socket.io server.
- **CORS**: restricted to an allow-list from `ALLOWED_ORIGINS` (defaults to `localhost:3000,localhost:5173`); applied to both Express and Socket.io.
- **Security**: `helmet()`, JSON body limit 10mb, request logger (adds `requestId`), global rate limit (100/15min in prod, 2000 in dev).
- Mounts `stateScope` on all `/api` routes so downstream handlers know the caller's role/state.
- Registers routers: `/api/events`, `/api/alerts`, `/api/resources`, `/api/incidents`, `/api/predictions`, `/api/states`, `/api/admin`.
- **`/health`**: reports DB connectivity, ML service reachability, and the active CORS allow-list.
- **Socket.io security**: `io.use()` middleware verifies the Supabase JWT from `handshake.auth.token`, looks up the user's role/state server-side, and the connection handler joins `public`, `role:<role>`, and `state:<id>` rooms based on those **server-verified** values.
- Starts the HTTP server and bootstraps cron jobs.

### 8.2 Scheduled ingestion — `src/cron/apiPollers.js`
- **Schedules** (node-cron): USGS quakes every 5 min; FIRMS fires every 15 min (offset); GDACS every 10 min; EONET every 10 min; India alerts every 5 min; IMD every 30 min; NCS quakes every 5 min (staggered); CWC floods at :15/:45; stale-event cleanup hourly; plus an initial fetch 3 s after startup (wider lookback).
- **`upsertEvents()`**: normalizes each event, resolves `state_id` via the `get_state_from_point` PostGIS RPC, formats `location` as WKT `SRID=4326;POINT(lon lat)`, upserts to `events` on `dedup_hash` conflict, then emits `events:updated` to the `public` Socket.io room.
- **Auto-alerting**: for newly-created High/Critical India events, creates an `alerts` record and dispatches via Telegram/WhatsApp/SMS/web-push to default env recipients (a SACHET-style proxy). "New" is detected by `updated_at − created_at < 1 s`.
- **India dedup (M5)**: the global USGS poller filters out events inside the India bbox so they are owned exclusively by the NCS poller, preventing duplicates.
- **Cleanup**: deactivates stale events by TTL (quakes/tsunami/landslide 48 h, wildfire 72 h, everything else 7 days).

### 8.3 REST API routes

**`/api/events`** (`routes/events.js`)
- `GET /` — paginated events; `mode=diverse` returns top-N per event_type in parallel for a balanced map; coordinators are auto-scoped to their state. PostGIS geography is returned as EWKB hex and parsed back to `{lat, lon}` via `parseWkbPoint()`. Cached 30 s via `cache.js`.
- `GET /stats/summary` — counts by type & severity (declared before `/:id` to avoid route capture). Cached 60 s.
- `GET /:id` — single event with parsed coords.
- `PATCH /:id/deactivate` — soft-delete (set `is_active=false`).

**`/api/alerts`** (`routes/alerts.js`)
- `GET /` — list alerts (coordinators state-scoped); `GET /:id` includes `alert_logs`.
- `POST /subscribe` — store a browser PushSubscription (`endpoint`, `keys.p256dh`, `keys.auth` → individual columns).
- `POST /` — Zod-validated alert creation; coordinators auto-tagged with their state; inserts as `draft`, then **asynchronously** routes through channels, writes per-recipient `alert_logs`, and flips status `sending → sent` (or `failed`). Audited via `logAudit`.
- `DELETE /:id` — **requires coordinator/admin** (B8 fix), audited.

**`/api/resources`** (`routes/resources.js`)
- `GET /` (state-scoped for coordinators), `POST /` (Zod-validated; type enum: ambulance/fire_truck/helicopter/shelter/food/water/medical/rescue_team/other; coordinators auto-scoped), `PATCH /:id` (assignment audited), `DELETE /:id`.

**`/api/incidents`** (`routes/incidents.js`)
- `GET /` — admins all, coordinators state-scoped, citizens own only.
- `GET /pending` — coordinator-only queue (`pending_review`/`under_review`).
- `GET /:id`.
- `POST /` — Zod-validated, authenticated; geocodes location → `state_id` via `get_state_from_point`; rate-limited (5 / 10 min); status `pending_review`; audited.
- `PATCH /:id/approve` & `/:id/reject` — coordinator/admin; reject requires a reason ≥ 5 chars; set `reviewer_id`/`reviewed_at`; audited.
- `PATCH /:id/status` — coordinator/admin gate (B8 fix); validates against the canonical status set.

**`/api/predictions`** (`routes/predictions.js`)
- `POST /misinformation` — proxies to ML `/classify/misinformation`, maps label → human classification + a credibility score, persists to `misinformation_checks`.
- `GET /misinformation/history` — last 20 checks.
- `GET /flood/:basinId` — looks up the river station, fetches **real** 30-day GloFAS discharge from Open-Meteo, forwards to ML `/india/flood-risk`; `demo:true` fallback if the upstream fails.
- `GET /earthquake/:district` — maps district → coords, computes BIS seismic zone, fetches **real** USGS quakes within 300 km/30 days, forwards to ML `/india/earthquake-risk`.
- `GET /heatwave/:district` — fetches **real** Open-Meteo max-temps, derives anomalies, forwards to ML `/india/heatwave-risk`.

**`/api/states`** (`routes/states.js`) — lists states with code/capital/bbox.

**`/api/admin`** (`routes/admin.js`, admin-only guard)
- `GET /coordinators`, `PATCH /coordinators/:id` (assign state), `GET /stats` (nationwide totals + state breakdown), `GET /audit-logs`, `GET /users`, `PATCH /users/:id` (role/state).

### 8.4 Middleware
- **`stateScope.js`** — if a Bearer token is present, verifies it with the anon client, then fetches the profile (role, state_id) with the service-role client (bypassing RLS) and attaches `req.userId/userRole/userStateId`. Fail-open (anonymous) on any error.
- **`requestLogger.js`** — assigns an 8-char `requestId`, logs `METHOD path → status ms [id]` on finish.
- **`errorHandler.js`** — uniform JSON error shape; stack traces only outside production.
- **`cache.js`** — in-memory TTL response cache used by `events`.
- **`auth.js` / `rateLimiter.js` / `validator.js`** — reusable helpers.

### 8.5 Utilities
- **`lib/db.js`** — lazy singletons `getAdminDb()` (service role) and `getAnonDb()` (anon), replacing per-request client creation.
- **`utils/axiosClient.js`** — axios instance with retry for flaky upstreams.
- **`utils/auditLogger.js`** — inserts into `audit_logs` (`action_type`, `user_id`, `entity_id`, `metadata`), used across alert/incident/resource actions.
- **`services/cacheService.js`** — `fetchWithCache(key, ttl, fn)` over Upstash Redis; silently degrades to no-cache if Redis isn't configured.

---

## 9. ML service (FastAPI/Python) — detailed

`app/main.py` registers four routers under `/predict`, `/classify`, `/optimize`, `/india`, exposes `/health` and `/docs`, and (currently) allows all CORS origins.

### 9.1 Forecasting — `routers/predict.py` + `services/prophet_service.py`
- `POST /predict/risk` — requires ≥ 10 history points; fits **Facebook Prophet** (yearly/weekly seasonality, configurable changepoint scale, 80% interval). If Prophet isn't installed, falls back to **linear extrapolation** via `numpy.polyfit`. Maps the peak `yhat` to a risk level using per-event-type thresholds and computes a confidence from the coefficient of variation.
- `GET /predict/risk/demo` — synthetic Poisson+sine history for a no-input demo.

### 9.2 Classification — `routers/classify.py` + `services/sklearn_service.py`
- `POST /classify/severity` — **rule-based** severity: event-specific thresholds (earthquake by magnitude, wildfire by FRP, flood by level) with a generic weighted feature score (wind/precip/area/population) for unknown types.
- `POST /classify/misinformation` — **regex/keyword + source-credibility** screening. Counts matches against known panic/disinfo phrases and checks the source domain against a reliable-source allow-list; returns `reliable | suspicious | misinformation` with a confidence and explanation. (Honestly documented as rule-based — no ML model; the previously-dead HuggingFace path was removed.)

### 9.3 Optimization — `routers/optimize.py` + `services/ortools_service.py`
- `POST /optimize/routes` — **Vehicle Routing Problem** via Google OR-Tools (Haversine distance matrix, per-vehicle max-distance dimension, guided local search, 10 s limit). Greedy round-robin fallback if OR-Tools isn't installed.
- `POST /optimize/allocate` — greedy nearest-resource allocation that **consumes** assigned resources from the pool (so none is double-assigned) and reports `unmet_demands` + `fulfillment_rate`.

### 9.4 India AI — `routers/india.py`
- `POST /india/flood-risk` — Prophet forecast of river level vs the CWC danger level → Critical/High/Medium/Low.
- `POST /india/earthquake-risk` — NDMA seismic-zone base score + Gutenberg-Richter-inspired exponential weighting of recent magnitudes → 0–100 risk score + level.
- `POST /india/heatwave-risk` — IMD anomaly thresholds (≥4.5 °C heatwave, ≥6.4 °C severe) + sigmoid probability around the 4.5 °C threshold.

---

## 10. Database — detailed

PostgreSQL on Supabase with **PostGIS** enabled. Geometry stored as `GEOGRAPHY(POINT/POLYGON, 4326)`.

### 10.1 Core tables
- **`events`** — `id, source, event_type, severity(Low/Medium/High/Critical), title, description, location(GEOGRAPHY POINT), geojson, raw_data(JSONB), detected_at, updated_at, is_active, dedup_hash(UNIQUE)`, plus `state_id` and `created_by` (added in 006). GIST index on `location`; composite indexes on type/severity/active.
- **`alerts`** — `id, event_id, title, body, severity, channels(TEXT[]), target_zone(GEOGRAPHY POLYGON), status(draft/sending/sent/failed), sent_at, created_at, created_by`, plus `state_id` (006). GIST index on `target_zone`.
- **`resources`** — `id, name, type, status(available/deployed/maintenance/unavailable), quantity(≥0), location, assigned_event, contact, notes, updated_at`, plus `state_id` (006).
- **`incident_reports`** — `id, reporter_id, description, location, media_urls(TEXT[]), status, event_id, created_at`, plus `state_id, reviewer_id, reviewed_at, rejection_reason, category, title` (005/006). Status canonical set (006): `pending_review | under_review | approved | rejected | resolved`.
- **`alert_logs`** — `id, alert_id, channel, recipient, delivered, error_msg, sent_at`, plus `recipient_type` (005).

### 10.2 Auth/meta tables
- **`user_profiles`** — `id (→auth.users), role(citizen/coordinator/responder/admin), full_name, created_at, updated_at`, plus `state_id, assigned_at` (006). Auto-created on signup via trigger.
- **`states`** — `id, name, code, capital, bbox_north/south/east/west, created_at`; seeded with **36 Indian states/UTs** (006).
- **`audit_logs`** — `id, user_id, action_type, entity_id, metadata(JSONB), created_at`.
- **`misinformation_checks`** — `id, input_text, credibility_score(0–100), classification, confidence(0–100), is_misinformation, explanation, report_id(→incident_reports), analyzed_at`.
- **`push_subscriptions`** — `id, user_id, endpoint(UNIQUE), p256dh, auth, device_info(JSONB), created_at`.

### 10.3 Functions, triggers & RLS
- **`get_state_from_point(lat, lon)`** — returns the state UUID whose bbox contains the point (smallest-area match on overlap), used by event/incident ingestion.
- **`update_updated_at_column()`** trigger on `events`/`resources`.
- **`handle_new_user_unified()`** trigger on `auth.users` — creates the profile (role from signup metadata) and writes a `USER_SIGNUP` audit log (unifies the earlier conflicting 002/003 triggers).
- **RLS** — enabled on all tables. Public can read active events / sent alerts / resources / states; authenticated users can read profiles and submit reports; coordinators/admins can read & manage state data; the service-role key (backend) bypasses RLS.
- **Realtime** — `events` and `alerts` added to the `supabase_realtime` publication.

### 10.4 Migration history
| File | Purpose |
|------|---------|
| `001_initial_schema.sql` | Core tables, indexes, base RLS, realtime |
| `002_user_profiles.sql` | `user_profiles` + signup trigger |
| `003_audit_logs.sql` | `audit_logs` + signup audit trigger |
| `004_fix_auth_triggers.sql` | Resolve conflicting signup triggers |
| `005_schema_patch.sql` | Incident category/title, RLS hardening, misc constraints, push table, `misinformation_checks` (table-create fix applied) |
| `006_consolidated_clean.sql` | `states` + seed, `get_state_from_point`, `state_id` across tables, canonical incident status, `misinformation_checks`, unified trigger, full RLS pass |

---

## 11. Frontend (React/Vite) — detailed

### 11.1 Entry & routing
- **`main.jsx`** — mounts React root, conditionally initializes Sentry (browser tracing + replay).
- **`App.jsx`** — wraps the app in `QueryClientProvider` (TanStack Query, 60 s stale, 5 min refetch, retry-with-backoff), `AuthProvider`, and `BrowserRouter`. A `GlobalEventFetcher` renders once outside `<Routes>` so events stay loaded across navigation. Routes:
  - `/landing`, `/login`, `/register` (guest)
  - `/portal` (public, role-guarded so logged-in coordinators/admins are redirected home)
  - `/citizen` (citizen/coordinator/admin), `/dashboard` (coordinator), `/admin` & `/admin/coordinators` (admin) via `ProtectedRoute`
  - `RoleHomeRedirect` sends users to their role's home; catch-all → `/`.

### 11.2 State & data
- **`hooks/useAuth.jsx`** — `AuthProvider` context tracking `user`, `role`, `profile` (joined with the user's `states` bbox), and `loading`. Loads the session, subscribes to auth changes, fetches the profile **before** clearing `loading` (prevents role-null redirect races), and exposes `signOut`.
- **`hooks/useDisasterEvents.js`** — the live data engine: TanStack Query fetches events (`mode=diverse`) and stats, a Supabase Realtime channel listens for `events` INSERTs (adds to store + toast + invalidates stats), and a Socket.io client listens for `events:updated` (invalidates queries). Pushes everything into the Zustand store.
- **`store/useAppStore.js`** — Zustand global store (`events`, stats, connection status, last update, notifications).
- **`services/supabaseClient.js`** — browser Supabase client (anon key, Realtime configured).
- **`services/backendApi.js`** — REST wrapper (`eventsApi`, etc.) over the backend.

### 11.3 UI building blocks
- **Pages**: `LandingPage`, `LoginPage`, `SignupPage`, `PublicPortal` (public live map + alerts), `CitizenPortal` (report submission + own reports), `CoordinatorDashboard` (state ops), `AdminDashboard` (national stats), `AdminCoordinators` (assignment UI).
- **Shared components**: `Navbar` (hidden on landing/auth routes), `ProtectedRoute` (role-gated), `PWAInstallBanner`.
- **Visualization libs**: Leaflet (+ markercluster + heat) for maps, Three.js / react-three-fiber for 3D, Chart.js for charts, framer-motion for animation, jspdf + xlsx for report exports, Turf for geo computations.

### 11.4 PWA & push
- Installable PWA (manifest + `vite-plugin-pwa`).
- **`utils/pushService.js`** — registers `/sw.js`, requests notification permission, subscribes via `VITE_VAPID_PUBLIC_KEY`, and POSTs the subscription to `/api/alerts/subscribe`.

---

## 12. Real-time architecture

1. **Backend cron** ingests and upserts events, then emits `events:updated` to the Socket.io `public` room.
2. **Supabase Realtime** independently streams `events` INSERTs to subscribed browsers.
3. **Frontend** merges all three signals (REST poll + Supabase Realtime + Socket.io) into one Zustand store so the map/dashboards stay current with redundancy.
4. **Socket.io rooms** (`public`, `role:<role>`, `state:<id>`) are joined based on the server-verified JWT, enabling future scoped broadcasts (e.g., state-specific alerts) without leaking to all clients.

---

## 13. Notifications & multi-channel alerting

`services/notificationRouter.js` lazily initializes each provider only when its keys exist and exposes `routeAlert(alert, channels, recipients)`:
- **Email** (Resend), **Telegram** (Telegraf), **WhatsApp** (Twilio), **SMS** (Twilio, dedicated `TWILIO_SMS_NUMBER` — no WhatsApp-sandbox fallback), **Web Push** (web-push; reshapes stored `{endpoint, p256dh, auth}` into the `{endpoint, keys:{…}}` shape the SDK needs), and **multilingual** translation (LibreTranslate; skipped gracefully if `LIBRETRANSLATE_URL` is unset; supports hi/ta/te/bn/gu/mr/pa).
- Each channel attempt is recorded as an `alert_logs` row. Manual alerts are created via `POST /api/alerts`; automated India alerts originate in the cron auto-alerting block.

---

## 14. Authentication, roles & access control

- **Identity**: Supabase Auth (email/password). JWTs are issued to the browser; a `user_profiles` row is auto-created on signup with role from signup metadata (default `citizen`).
- **Backend authorization**: `stateScope` verifies the JWT and attaches `userId/userRole/userStateId`; route handlers enforce role checks (admin routes gated globally; coordinators auto-scoped to their state; destructive routes require coordinator/admin).
- **Database authorization**: Postgres RLS provides defense-in-depth — public read of safe data, authenticated submit/read-own for reports, coordinator/admin management policies, and service-role bypass for trusted backend operations.
- **Real-time authorization**: Socket.io handshake JWT verification → server-assigned rooms (clients cannot self-assert role/state).

---

## 15. Configuration & environment variables

**Backend (`backend/.env`)**
- Core: `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS`
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- Data APIs: `FIRMS_API_KEY` (others are keyless)
- ML/translation: `ML_SERVICE_URL`, `LIBRETRANSLATE_URL`
- Cache: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Notifications: `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_SMS_NUMBER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- Auto-alert defaults: `DEFAULT_TELEGRAM_CHAT_ID`, `DEFAULT_WHATSAPP_NUMBER`, `DEFAULT_SMS_NUMBER`
- Monitoring: `SENTRY_DSN`

**Frontend (`frontend/.env.local`, `VITE_` = browser-exposed, never secrets)**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`, `VITE_ML_SERVICE_URL`, `VITE_VAPID_PUBLIC_KEY`, `VITE_SENTRY_DSN`

> Note: the frontend push code reads `VITE_API_URL` while the example documents `VITE_BACKEND_URL` — standardize these (see Known Issues).

---

## 16. Local development & deployment

**Prerequisites**: Node ≥ 20, Python 3.x, a Supabase project (PostGIS enabled), optional Upstash Redis.

**Database**: apply migrations `001 → 006` in order (Supabase SQL editor or `supabase db reset`). Verify with `SELECT count(*) FROM states;` (expect 36) and `SELECT get_state_from_point(28.61, 77.20);` (expect Delhi).

**Backend**: `cd backend && npm install && npm run dev` (nodemon) → `http://localhost:4000`. `npm test` runs Jest/Supertest. Cron starts automatically.

**ML service**: `cd ml-service`, create venv, `pip install -r requirements.txt`, run Uvicorn → `http://localhost:8000` (`/docs` for Swagger). Prophet and OR-Tools have fallbacks if unavailable.

**Frontend**: `cd frontend && npm install && npm run dev` → Vite dev server (5173). `npm run build` for production; PWA assets generated by `vite-plugin-pwa`.

**Hosting**: designed for Render-style deployment of backend + ML; a keep-alive ping is present but intentionally disabled to stay within free-tier hours. Supabase and Upstash are managed.

---

## 17. End-to-end data flows

**A. Hazard ingestion → live map**
`cron schedule → service fetch (cached) → normalize + dedup → resolve state_id → upsert events → emit events:updated (public room) + Supabase Realtime INSERT → frontend store update → Leaflet map + dashboards refresh`.

**B. Citizen report → coordinator action**
`citizen submits POST /api/incidents (auth + Zod + rate limit) → geocode to state_id → insert pending_review (+audit) → coordinator GET /pending (state-scoped) → PATCH approve/reject (reviewer_id, reviewed_at, +audit)`.

**C. Alert dispatch**
`coordinator POST /api/alerts (Zod, state-tagged) → insert draft → async routeAlert across channels → per-recipient alert_logs → status sending→sent`. Automated path: cron detects High/Critical India event → creates alert → routes to default recipients.

**D. AI prediction**
`frontend → GET /api/predictions/{flood|earthquake|heatwave}/:id → backend fetches real source data (GloFAS/USGS/Open-Meteo) → POST to ML /india/* → Prophet/scoring → response (with demo flag if upstream failed)`.

---

## 18. Known issues & technical debt

Tracked in `CODE_REVIEW_FIXES.md` and `CODE_REVIEW_ROUND2.md`. Current open/important items:

- **Clean-room migration apply unverified.** The live cloud DB is correctly shaped, but a from-scratch `supabase db reset` (after the `005` table-create fix) has not yet been demonstrated with a zero-error log. Required before claiming reproducible deploy.
- **Migration churn.** Six migrations with overlapping/idempotent patches; should eventually be squashed into a single authoritative schema.
- **Env var naming drift.** Frontend push uses `VITE_API_URL`; examples use `VITE_BACKEND_URL`. Standardize.
- **Auto-alert "isNew" heuristic** (`updated_at − created_at < 1 s`) is fragile and depends on DB trigger timing.
- **Per-event RPC in ingestion.** `get_state_from_point` is called once per event in a loop; consider batching for large polls.
- **Repo hygiene.** Throwaway proof/scratch scripts should live under `backend/tests/integration/`, not the repo root.
- **Frontend test depth.** Vitest is configured; component/integration coverage should be expanded.
- **Severity confidence values** in the rule classifier are heuristic constants, not learned — fine as long as it's presented as rule-based.

---

## 19. Glossary

- **BIS seismic zone** — Bureau of Indian Standards earthquake hazard zones II–V (V = highest).
- **GloFAS** — Global Flood Awareness System; river discharge model used as a CWC proxy via Open-Meteo.
- **GDACS** — Global Disaster Alert and Coordination System (UN/EU).
- **EONET** — NASA Earth Observatory Natural Event Tracker.
- **FIRMS** — NASA Fire Information for Resource Management System (VIIRS hotspots).
- **NCS / IMD / CWC / NDMA / SACHET** — India's National Centre for Seismology / Meteorological Department / Central Water Commission / National Disaster Management Authority / NDMA's alert system.
- **dedup_hash** — deterministic per-event key used to upsert and prevent duplicates.
- **WKT / EWKB** — Well-Known Text / Extended Well-Known Binary encodings for PostGIS geometry.
- **RLS** — Row-Level Security (Postgres policy-based authorization).
- **VRP** — Vehicle Routing Problem (solved with Google OR-Tools).

---

*This document reflects the codebase as reviewed. When the engineer's outstanding fixes (clean migration apply log, repo cleanup) land, update §18 accordingly.*
