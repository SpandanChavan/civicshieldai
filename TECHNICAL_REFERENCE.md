# CivicShield AI — Complete Technical Reference

> The authoritative, in-depth reference for the entire project: purpose, architecture, every backend route and service, the ML service, the full database model, the frontend, real-time, notifications, auth/RBAC, CI/CD, the production-divergence situation, and known issues.
> Reflects the codebase as of the current session (migrations through `009`, CI with a local Supabase stack, RLS audit, drift guard).

---

## Table of Contents
1. [What it is & why](#1-what-it-is--why)
2. [Roles & personas](#2-roles--personas)
3. [Architecture](#3-architecture)
4. [Tech stack](#4-tech-stack)
5. [Repository layout](#5-repository-layout)
6. [External data sources](#6-external-data-sources)
7. [Backend — every module in depth](#7-backend--every-module-in-depth)
8. [ML service — every endpoint & algorithm](#8-ml-service--every-endpoint--algorithm)
9. [Database — full model](#9-database--full-model)
10. [Frontend — in depth](#10-frontend--in-depth)
11. [Real-time architecture](#11-real-time-architecture)
12. [Notifications & alerting](#12-notifications--alerting)
13. [Authentication, roles & RLS](#13-authentication-roles--rls)
14. [CI/CD pipeline](#14-cicd-pipeline)
15. [Configuration & env vars](#15-configuration--env-vars)
16. [Production state & the divergence problem](#16-production-state--the-divergence-problem)
17. [End-to-end data flows](#17-end-to-end-data-flows)
18. [Known issues & technical debt](#18-known-issues--technical-debt)
19. [Glossary](#19-glossary)

---

## 1. What it is & why

CivicShield AI is a real-time, India-focused disaster-management platform. It continuously ingests hazard data from multiple authoritative global/Indian sources (earthquakes, wildfires, floods, cyclones, heatwaves, etc.), normalizes and deduplicates it into one geospatial event model, stores it in PostgreSQL+PostGIS, and serves it in real time to the public, state coordinators, and national admins. On top of the live feed it layers AI/analytics (risk forecasting, severity classification, misinformation screening, resource/route optimization) and a multi-channel alerting system (web push, Telegram, WhatsApp, SMS, email).

**Why:** India's hazard data is fragmented and largely lacks public APIs (NDMA SACHET, IMD, NCS, CWC are closed or client-rendered). The project unifies open proxies (USGS for seismicity, GloFAS/Open-Meteo for floods & weather, GDACS, NASA EONET/FIRMS, FloodList) into one situational-awareness layer, adds intelligence, and pushes alerts to affected people in near-real-time.

**Shape:** a three-service monorepo — `backend/` (Node/Express + Socket.io), `ml-service/` (Python/FastAPI), `frontend/` (React/Vite) — plus `supabase/` (Postgres+PostGIS schema, migrations, RLS).

---

## 2. Roles & personas

| Role | Auth | Capabilities |
|------|------|--------------|
| **Public/Guest** | none | Public portal: live map of active events, sent alerts, resources |
| **Citizen** | `role=citizen` | Submit incident reports (location + media), view own reports, receive alerts |
| **Coordinator** | `role=coordinator` + `state_id` | State-scoped ops: review/approve/reject reports, create & send alerts, manage resources, view state events |
| **Responder** | `role=responder` | Field role; read access to reports |
| **Admin** | `role=admin` | Nationwide: aggregate stats, manage users & coordinator↔state assignments, audit logs, unrestricted reads |

Roles live in `user_profiles.role`; coordinators/admins are scoped by `user_profiles.state_id`.

---

## 3. Architecture

```
External sources (USGS, FIRMS, GDACS, EONET, Open-Meteo, GloFAS, FloodList)
        │  scheduled polling (node-cron)
        ▼
BACKEND (Express + Socket.io)
  cron/apiPollers → services/* (one per source) → normalize + dedup
                  → resolve state_id (get_state_from_point) → upsert events
                  → emit 'events:updated' (Socket.io) + auto-alert High/Critical India events
  routes/* → REST API   middleware/* → JWT→role/state, rate-limit, logging, errors
  notificationRouter → email/telegram/whatsapp/sms/web-push
        │ service-role (bypasses RLS)            │ proxy            │ realtime rooms
        ▼                                        ▼                  ▼
   SUPABASE (Postgres+PostGIS+Auth+Realtime+RLS)   ML SERVICE (FastAPI)   public/role:*/state:*
        │ Realtime postgres_changes + REST
        ▼
FRONTEND (React/Vite)
  TanStack Query (REST) + Supabase Realtime + Socket.io (triple redundancy)
  Zustand store · Leaflet maps · Three.js globe · Chart.js · PWA
```

---

## 4. Tech stack

**Backend:** Node ≥20, Express 4, Socket.io 4, `ws`; `@supabase/supabase-js` (pinned 2.43.4); `node-cron`, `axios`+`axios-retry`, `xml2js`/`feedparser-promised`; `@upstash/redis`; `zod`; `helmet`+`express-rate-limit`; `resend`, `telegraf`, `twilio`, `web-push`; `@sentry/node`. Jest+Supertest (unit, mocked).

**ML:** Python, FastAPI, Pydantic; `prophet` (+ linear fallback), `numpy`, `pandas`; `ortools` (+ greedy fallback); `httpx`.

**Frontend:** React 18 + Vite 5, React Router 6; TanStack Query 5, Zustand 4; Leaflet (+markercluster+heat), Three.js + react-three-fiber/drei; Chart.js; framer-motion; `@turf/turf`; jspdf+xlsx; socket.io-client; `@sentry/react`; vite-plugin-pwa. Vitest + Testing Library.

**Data/infra:** Supabase (Postgres+PostGIS+Auth+Realtime+RLS), Upstash Redis, GitHub Actions CI with a local Supabase stack.

---

## 5. Repository layout

```
civicshield-ai/
├─ backend/src/
│  ├─ app.js                    # Express+Socket.io entry; CORS allow-list; helmet; rate-limit;
│  │                            #   stateScope on /api; routes; /health; Socket.io JWT handshake + rooms; cron bootstrap
│  ├─ cron/apiPollers.js        # schedules; upsertEvents (state_id resolve + cache); auto-alert; cleanup
│  ├─ routes/ {events,alerts,resources,incidents,predictions,states,admin}.js
│  ├─ middleware/ {stateScope,auth,requestLogger,errorHandler,rateLimiter,validator,cache}.js
│  ├─ services/ {usgsEarthquake,nasaFirms,gdacs,india-alerts,imd,ncs,cwc,notificationRouter,cacheService}.js
│  ├─ lib/db.js                 # getAdminDb()/getAnonDb() singletons (+ global.WebSocket polyfill)
│  └─ utils/ {axiosClient,auditLogger}.js
│  └─ tests/ {*.test.js (mocked unit), integration/{rls.test.js,smoke_test.js,proof_e2e_incident.js}}
├─ ml-service/app/
│  ├─ main.py                   # FastAPI app, routers, /health
│  ├─ routers/ {predict,classify,optimize,india}.py
│  └─ services/ {prophet_service,sklearn_service,ortools_service}.py
├─ frontend/src/
│  ├─ main.jsx, App.jsx
│  ├─ pages/, components/shared/, hooks/{useAuth,useDisasterEvents}, store/useAppStore.js,
│  │  services/{supabaseClient,backendApi}.js, utils/{pushService,formatDate}.js, components/map/DisasterMap.jsx
├─ supabase/
│  ├─ schema.sql                # consolidated authoritative fresh-DB schema (squashed 001→009)
│  ├─ config.toml               # local Supabase project (major_version=17)
│  ├─ migrations/001…009*.sql
│  └─ oneoff/reconcile_prod.sql # one-off prod reconciliation (NOT a migration)
├─ .github/workflows/ci.yml     # backend (local supabase stack + tests + drift guard), frontend, ml, secret-scan
└─ docs/rls_matrix.md
```

---

## 6. External data sources

| Source | Service | Provides | Key | India strategy |
|--------|---------|----------|-----|----------------|
| USGS FDSN | `usgsEarthquake.js`, `ncs.js` | Earthquakes (geojson) | none | NCS proxy = USGS bounded to India bbox (68–98E, 6–38N), 3.0+, BIS zone lookup |
| NASA FIRMS | `nasaFirms.js` | VIIRS fire hotspots (CSV) | `FIRMS_API_KEY` | India bbox 68,8,97,37 |
| GDACS | `gdacs.js`, `india-alerts.js` | Global RSS + India bbox event list | none | Dedicated India bbox query |
| NASA EONET | `gdacs.js` | Open natural events | none | Normalized categories |
| Open-Meteo (weather) | `imd.js`, `predictions.js` | Forecast temps/precip/wind | none | IMD proxy; 18 cities |
| Open-Meteo Flood (GloFAS) | `cwc.js`, `predictions.js` | River discharge forecasts | none | CWC proxy; 18 river stations |
| FloodList RSS | `india-alerts.js` | India-tagged flood news | none | Keyword filter |

All data fetches cache via Upstash Redis (`cacheService.fetchWithCache`), degrading to no-cache if Redis isn't configured.

---

## 7. Backend — every module in depth

### 7.1 `app.js` (entry)
- Loads env; sets `global.WebSocket = require('ws')` (Node-20 needs it for supabase-js Realtime); conditional Sentry init.
- **CORS:** allow-list from `ALLOWED_ORIGINS` (default `localhost:3000,5173`), applied to Express + Socket.io.
- **Security:** `helmet()`, JSON 10mb limit, `requestLogger`, global rate-limit (100/15min prod, 2000 dev).
- `stateScope` mounted on all `/api` routes.
- Routes: `/api/events|alerts|resources|incidents|predictions|states|admin`.
- `/health`: DB connectivity + ML reachability + active CORS origins.
- **Socket.io:** `io.use()` verifies Supabase JWT from `handshake.auth.token`; connection handler joins `public`, `role:<role>`, `state:<id>` from **server-verified** values.
- Boots cron after `httpServer.listen`.

### 7.2 `cron/apiPollers.js`
- **Schedules:** USGS 5min; FIRMS 15min; GDACS 10min; EONET 10min; India 5min; IMD 30min; NCS 5min; CWC :15/:45; cleanup hourly; initial fetch 3s after boot.
- **`upsertEvents(events, io, type)`:** resolves `state_id` per event via `get_state_from_point` (cached by rounded coords to cut RPC calls), formats `location` as WKT `SRID=4326;POINT(lon lat)`, upserts on `dedup_hash`, emits `events:updated` to `public` room.
- **Auto-alert:** for High/Critical India events with `alerted_at IS NULL`, creates an `alerts` row (`event_id`, `state_id`), routes via telegram/whatsapp/sms/web-push to default env recipients, stamps `events.alerted_at` (deterministic — replaced the old `updated_at−created_at<1s` heuristic).
- **India dedup:** global USGS poller filters out India-bbox events (NCS owns them).
- **Cleanup:** deactivates stale events by TTL (quake/tsunami/landslide 48h, wildfire 72h, else 7d).

### 7.3 Routes
- **`events.js`** — `GET /` (paginated; `mode=diverse` = top-N per type; coordinator state-scoped; EWKB→{lat,lon} via `parseWkbPoint`; 30s cache), `GET /stats/summary` (60s cache, declared before `/:id`), `GET /:id`, `PATCH /:id/deactivate`.
- **`alerts.js`** — `GET /` (coordinator state-scoped), `GET /:id` (+`alert_logs`), `POST /subscribe` (web-push: `endpoint`,`keys.p256dh`,`keys.auth`→columns), `POST /` (Zod; coordinator auto-tagged state; insert `draft`→async `routeAlert`→write `alert_logs`→`sent`/`failed`; audited), `DELETE /:id` (coordinator/admin only; audited).
- **`resources.js`** — `GET /` (state-scoped), `POST /` (Zod; type enum; coordinator auto-scoped), `PATCH /:id` (strict partial Zod, lat/lon→WKT), `DELETE /:id`.
- **`incidents.js`** — `GET /` (admin all / coordinator state / citizen own), `GET /pending` (coordinator queue), `GET /:id`, `POST /` (Zod, authenticated, geocode→state_id, rate-limit 5/10min, status `pending_review`, audited), `PATCH /:id/approve`+`/reject` (coordinator/admin; reject needs reason ≥5; set reviewer_id/reviewed_at), `PATCH /:id/status` (coordinator/admin; canonical status set).
- **`predictions.js`** — `POST /misinformation` (→ML `/classify/misinformation`, persists to `misinformation_checks`), `GET /misinformation/history`, `GET /flood/:basinId` (real GloFAS discharge → ML `/india/flood-risk`; `demo:true` fallback), `GET /earthquake/:district` (real USGS 300km/30d → ML `/india/earthquake-risk`), `GET /heatwave/:district` (real Open-Meteo temps→anomalies → ML `/india/heatwave-risk`).
- **`states.js`** — `GET /` lists states.
- **`admin.js`** — admin-guarded: `GET /coordinators`, `PATCH /coordinators/:id`, `GET /stats`, `GET /audit-logs`, `GET /users`, `PATCH /users/:id`.

### 7.4 Middleware & utils
- **`stateScope.js`** — verifies JWT (anon client), fetches profile (role, state_id) via service-role, sets `req.userId/userRole/userStateId`; fail-open anonymous.
- **`requestLogger.js`** — 8-char requestId + `METHOD path → status ms [id]`.
- **`errorHandler.js`** — uniform JSON error; stack only in dev.
- **`cache.js`** — in-memory TTL response cache (events).
- **`lib/db.js`** — `getAdminDb()` (service role) / `getAnonDb()` (anon) singletons; sets `global.WebSocket`.
- **`utils/axiosClient.js`** — axios + retry. **`utils/auditLogger.js`** — inserts `audit_logs`.
- **`services/cacheService.js`** — `fetchWithCache(key, ttl, fn)` over Upstash.

---

## 8. ML service — every endpoint & algorithm

`main.py` mounts routers under `/predict`, `/classify`, `/optimize`, `/india`; `/health`, `/docs`. CORS currently `*`.

- **`/predict/risk`** (`prophet_service`) — needs ≥10 history points; **Facebook Prophet** (yearly/weekly seasonality, 80% interval), **linear `numpy.polyfit` fallback** if Prophet absent; peak `yhat`→risk level by per-type thresholds; confidence from coefficient of variation. `/predict/risk/demo` = synthetic.
- **`/classify/severity`** (`sklearn_service`) — **rule-based**: per-event thresholds (earthquake by mag, wildfire by FRP, flood by level) + generic weighted feature score. *(No actual scikit-learn model — honestly documented as rules.)*
- **`/classify/misinformation`** — **regex/keyword + source-credibility**: counts panic/disinfo patterns, checks source against reliable-domain allow-list; returns `reliable|suspicious|misinformation` + confidence + explanation. (Dead HuggingFace path was removed.)
- **`/optimize/routes`** (`ortools_service`) — **Google OR-Tools VRP** (Haversine matrix, per-vehicle max-distance, guided local search, 10s limit); greedy round-robin fallback.
- **`/optimize/allocate`** — greedy nearest-resource allocation that **consumes** assigned resources (no double-assign); reports `unmet_demands` + `fulfillment_rate`.
- **`/india/flood-risk`** — Prophet forecast vs CWC danger level → risk.
- **`/india/earthquake-risk`** — NDMA zone base score + Gutenberg-Richter-style exponential weighting of recent magnitudes → 0–100.
- **`/india/heatwave-risk`** — IMD anomaly thresholds (≥4.5 heat, ≥6.4 severe) + sigmoid probability.

---

## 9. Database — full model

PostgreSQL on Supabase, **PostGIS** enabled; geometry as `GEOGRAPHY(POINT/POLYGON,4326)`.

### 9.1 Core tables (final state, per `schema.sql` / migrations 001→009)
- **`events`** — id, source, event_type, severity(CHECK Low/Medium/High/Critical), title, description, location(GEOGRAPHY POINT), geojson, raw_data, detected_at, updated_at, is_active, dedup_hash(UNIQUE), **state_id**(→states), **created_by**(→auth.users), **alerted_at**. GIST(location); indexes on type/severity/active, state, partial `severity WHERE alerted_at IS NULL`. `updated_at` trigger.
- **`alerts`** — id, event_id(→events), title, body, severity, channels[], target_zone(GEOGRAPHY POLYGON), status(CHECK draft/sending/sent/failed, default draft), sent_at, created_at, created_by, **state_id**. GIST(target_zone); indexes event/status/state.
- **`resources`** — id, name, type, status(CHECK available/deployed/maintenance/unavailable), quantity(≥0), location, assigned_event, contact, notes, updated_at, **state_id**. GIST(location); status/state indexes; `updated_at` trigger.
- **`incident_reports`** — id, reporter_id(→auth.users), description, location, media_urls[], status(CHECK pending_review/under_review/approved/rejected/resolved, **default pending_review**), event_id, created_at, **state_id**, **reviewer_id**, **reviewed_at**, **rejection_reason**, **category**(CHECK enum), **title**. GIST(location); status/state/category indexes.
- **`alert_logs`** — id, alert_id(→alerts CASCADE), channel, recipient, delivered, error_msg, sent_at, recipient_type(CHECK email/sms/push/webhook).

### 9.2 Auth/meta tables
- **`user_profiles`** — id(→auth.users), role(CHECK citizen/coordinator/responder/admin), full_name, **state_id**, **assigned_at**, created_at, updated_at.
- **`states`** — id, name(UNIQUE), code(UNIQUE), capital, bbox_north/south/east/west, created_at; **seeded with 36 Indian states/UTs**.
- **`audit_logs`** — id, user_id, action_type, entity_id, metadata(JSONB), created_at.
- **`misinformation_checks`** — id, input_text, credibility_score(0–100), classification, confidence(0–100), is_misinformation, explanation, report_id(→incident_reports), analyzed_at.
- **`push_subscriptions`** — id, user_id(→auth.users), endpoint(UNIQUE), p256dh, auth, device_info, created_at.

### 9.3 Functions, triggers, RLS
- **`get_state_from_point(lat,lon)`** — returns the state UUID whose bbox contains the point (smallest-area on overlap).
- **`update_updated_at_column()`** trigger on events/resources.
- **`handle_new_user_unified()`** trigger on `auth.users` — creates profile (role from signup metadata) + writes `USER_SIGNUP` audit log (unifies older 002/003/004 triggers).
- **RLS** (code/`schema.sql` version): public read active events / sent alerts / resources / states; authenticated read profiles + submit/read-own reports; coordinator/admin manage (role-based); service-role bypass; least-privilege grants (anon=SELECT, authenticated=SELECT/INSERT/UPDATE/DELETE, service_role=ALL — **no TRUNCATE to anon**).
- **Realtime:** `events`, `alerts` in `supabase_realtime` publication.

### 9.4 Migration history
| File | Purpose |
|------|---------|
| 001_initial_schema | Core tables, indexes, base RLS, realtime; `CREATE EXTENSION postgis` (added for fresh rebuilds) |
| 002_user_profiles | user_profiles + signup trigger |
| 003_audit_logs | audit_logs + audit trigger |
| 004_fix_auth_triggers | resolve conflicting signup triggers |
| 005_schema_patch | incident category/title, RLS hardening, push table, **`misinformation_checks` table-create fix** |
| 006_consolidated_clean | states + seed, get_state_from_point, state_id across tables, canonical incident status, unified trigger, full RLS pass |
| 007_event_alerted_flag | `events.alerted_at` (+index), `resources.state_id` gap fix |
| 008_rls_audit_fixes | least-privilege grants (closed `GRANT ALL TO anon` TRUNCATE hole), misinformation RLS, service-role policies |
| 009_reconcile_schema_drift | `incident_reports.status` default→pending_review, drop stale trigger funcs, drop over-permissive policies, audit_logs.id default |
- **`schema.sql`** — squashed authoritative fresh-DB equivalent of 001→009; enforced 1:1 against migrations by the CI drift guard.

---

## 10. Frontend — in depth

- **`main.jsx`** — React root + conditional Sentry (tracing + replay).
- **`App.jsx`** — `QueryClientProvider` (60s stale, 5min refetch, retry+backoff) + `AuthProvider` + `BrowserRouter`; a `GlobalEventFetcher` keeps events loaded across pages. Routes: `/landing`,`/login`,`/register` (guest); `/portal` (public, role-guarded redirect); `/citizen`,`/dashboard`(coordinator),`/admin`+`/admin/coordinators`(admin) via `ProtectedRoute`; `RoleHomeRedirect` + catch-all.
- **`hooks/useAuth.jsx`** — `AuthProvider` context: `user`, `role`, `profile` (joined with the user's `states` bbox), `loading`; fetches profile **before** clearing loading (avoids role-null redirect race); `signOut`.
- **`hooks/useDisasterEvents.js`** — the live engine: TanStack Query (`mode=diverse`) + stats, Supabase Realtime channel on `events` INSERT (store + toast + invalidate), Socket.io `events:updated` (invalidate). Everything into Zustand.
- **`store/useAppStore.js`** — Zustand (events, stats, connection, lastUpdate, notifications).
- **`services/supabaseClient.js`** — browser anon client (Realtime). **`backendApi.js`** — REST wrapper.
- **Pages:** Landing (3D Three.js Earth globe loading `/textures/earth_*`), Login, Signup, PublicPortal, CitizenPortal, CoordinatorDashboard, AdminDashboard, AdminCoordinators.
- **Components:** `DisasterMap.jsx` (Leaflet + OSM tiles + CDN marker icons), Navbar, ProtectedRoute, PWAInstallBanner.
- **PWA/push:** installable; `pushService.js` registers `/sw.js`, subscribes via `VITE_VAPID_PUBLIC_KEY`, POSTs to `VITE_BACKEND_URL/api/alerts/subscribe`.

---

## 11. Real-time architecture
Three redundant channels merged into one Zustand store: (a) TanStack Query REST poll, (b) Supabase Realtime `postgres_changes` on `events`, (c) Socket.io `events:updated` from the backend cron. Socket.io rooms (`public`, `role:*`, `state:*`) are joined from the **server-verified** JWT, enabling future scoped broadcasts.

---

## 12. Notifications & alerting
`notificationRouter.routeAlert(alert, channels, recipients)` lazily inits each provider when keys exist:
- **Email** (Resend) — HTML escaped (XSS), subject CRLF-stripped.
- **Telegram** (Telegraf) — HTML parse_mode, escaped.
- **WhatsApp/SMS** (Twilio) — SMS uses dedicated `TWILIO_SMS_NUMBER` (no WhatsApp-sandbox fallback).
- **Web Push** (web-push) — reshapes `{endpoint,p256dh,auth}`→`{endpoint,keys:{…}}`.
- **Multilingual** (LibreTranslate, optional) — hi/ta/te/bn/gu/mr/pa; skipped if URL unset.
Each attempt logged to `alert_logs`. Manual alerts via `POST /api/alerts`; automated India alerts via cron auto-alert.

---

## 13. Authentication, roles & RLS
- **Identity:** Supabase Auth (email/password); profile auto-created on signup (`handle_new_user_unified`).
- **Backend authz:** `stateScope` → `req.userId/userRole/userStateId`; route role checks; admin routes globally guarded; coordinators auto-scoped; destructive routes require coordinator/admin.
- **DB authz (RLS):** defense-in-depth (see §9.3). Verified via `docs/rls_matrix.md` + `rls.test.js`.
- **Realtime authz:** Socket.io handshake JWT → server-assigned rooms (no client self-assertion).

---

## 14. CI/CD pipeline (`.github/workflows/ci.yml`)
Four jobs on PR/push to `main`/`deployment`:
1. **Backend** — `npm ci`, lint; spin up **local Supabase stack** (`supabase start`, PG17, full auth schema, applies migrations); export local stack creds (public demo keys); `npm test` (Jest unit, mocked; jest ignores `tests/integration/`); `npm run test:integration` (rls + smoke + e2e against the local stack — self-start the server via `require('src/app')`); **schema drift guard** (apply migrations to one DB + `schema.sql` to another, `pg_dump` both via `docker exec` PG17, strip `\restrict` artifacts, exact diff → fail on drift).
2. **Frontend** — lint + `test:ci` + build.
3. **ML service** — import smoke.
4. **Secret scan** — grep for real-key patterns (excludes example/lock/ci.yml).
Determinism: `@supabase/supabase-js` pinned + `package-lock.json` committed.

**Proven gates:** the integration tests caught a real RLS break (citizen-own-report) and a test-setup FK bug; the drift guard caught real schema inconsistencies (009) and a deliberate column.

---

## 15. Configuration & env vars
**Backend (`backend/.env`):** PORT, NODE_ENV, ALLOWED_ORIGINS; SUPABASE_URL/ANON_KEY/SERVICE_KEY; FIRMS_API_KEY; ML_SERVICE_URL, LIBRETRANSLATE_URL; UPSTASH_REDIS_REST_URL/TOKEN; RESEND_API_KEY, TELEGRAM_BOT_TOKEN, TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_NUMBER/SMS_NUMBER, VAPID_PUBLIC/PRIVATE_KEY; DEFAULT_TELEGRAM_CHAT_ID/WHATSAPP_NUMBER/SMS_NUMBER; SENTRY_DSN.
**Frontend (`frontend/.env.local`, VITE_ = browser-exposed):** VITE_SUPABASE_URL/ANON_KEY, VITE_BACKEND_URL, VITE_ML_SERVICE_URL, VITE_VAPID_PUBLIC_KEY, VITE_SENTRY_DSN.

---

## 16. Production state & the divergence problem

**Critical, currently-blocking finding.** The production Supabase database (`lkhahxhnzpavwdgmjysw`) is a **hand-built, divergent schema** — it was assembled via the SQL editor over time, not by applying migrations. Its `supabase_migrations.schema_migrations` history is **empty**.

A backup (`prod_backup.sql`) + a local rehearsal (restore → diff vs `schema.sql`) revealed prod **differs from the codebase in both directions**:

- **Prod has things the codebase lacks** — and they're *more advanced security*:
  - `coordinator_state_id()` function + **state-scoped RLS** policies (`"Coordinators manage own state alerts/events/resources"`, `"Coordinators see/update state reports"`) → coordinators restricted to their own state.
  - `assign_report_state()` **trigger** auto-filling `state_id` on insert.
  - `"Admins see all reports"`, `"Citizens see own reports"`, etc.
  - Legacy tables `active_hazards`, `citizen_reports` (unknown data).
- **Codebase has things prod lacks** — the simpler **role-based** policies (`"Coordinators manage alerts"`), `"Responders read all reports"`, several indexes (`idx_events_unalerted`, `idx_reports_reviewer`), and the `incident_reports_reviewer_id_fkey ON DELETE SET NULL`.

**Consequence:** the original plan ("repair migration history + `db push` 008/009") is **unsafe** — it would downgrade prod's state-scoped RLS to role-based and drop the auto-assign trigger (a security regression + feature loss). Also, `pg_dump --no-privileges` hid GRANTs, so the `008` anon-TRUNCATE question is **unverified on prod**.

**Status: deployment halted pending an architectural decision** — which RLS design is canonical? Recommendation: **adopt prod's state-scoped model into the codebase** (capture `coordinator_state_id()`, the per-state policies, and `assign_report_state()` into migrations + `schema.sql`), rather than overwrite prod. Then apply only the genuinely-missing safe fixes (status default already matches?, indexes, FK clause) to prod deliberately. `prod_backup.sql` (5.6 MB, verified complete) is the safety net; nothing has been changed on prod.

> Deploy steps, history-repair, and the rehearsal protocol live in `DEPLOY_CHECKLIST.md`. Auto-deploy stays OFF until this is resolved.

---

## 17. End-to-end data flows
- **Ingestion → map:** cron → service fetch (cached) → normalize+dedup → resolve state_id → upsert events → `events:updated` + Supabase Realtime INSERT → frontend store → map/dashboards.
- **Report → action:** citizen `POST /api/incidents` (auth+Zod+rate-limit) → geocode state_id → `pending_review` (+audit) → coordinator `/pending` → approve/reject (reviewer_id/reviewed_at, +audit).
- **Alert:** coordinator `POST /api/alerts` (Zod, state-tagged) → draft → async multi-channel → `alert_logs` → sent. Automated: cron detects High/Critical India → alert → default recipients → stamp `alerted_at`.
- **Prediction:** frontend → `GET /api/predictions/{flood|earthquake|heatwave}/:id` → backend fetches real source data → ML `/india/*` → Prophet/scoring → response (demo flag if upstream fails).

---

## 18. Known issues & technical debt
1. **Production divergence (blocking)** — §16; needs the canonical-RLS decision before any prod deploy.
2. **Migrations 008/009 not on prod** — they carry real fixes (status default, grant hardening) but can't be naively pushed (§16).
3. **AI/ML unvalidated** — severity/misinformation are rules (honestly labeled); no published accuracy; forecasts unbacktested.
4. **Frontend untested** — no real component/e2e coverage yet (P1-2).
5. **Observability thin** — Sentry only; `alert_logs` collected but unsurfaced; no ingestion dashboards/runbooks (P1-5).
6. **`schema.sql` hand-maintained** — must be re-aligned whenever a migration changes the dump (the drift guard enforces, but it's manual upkeep).
7. **Cron monolithic** — no queue/backpressure; per-event RPC mitigated by caching.
8. **CORS on ML service** still `*`.
9. **Security process** — a credential-exposure incident occurred this cycle (token extracted/hardcoded); token revoked; standing rule: agent never handles credentials.

**Scorecard (current ≈ 6.8/10):** strongest — Database (8.0), Docs (8.0); weakest — Observability (4.0), AI/ML (5.0), Frontend (6.0). See `PROJECT_SCORECARD.md`.

---

## 19. Glossary
- **BIS seismic zone** — Indian earthquake hazard zones II–V (V highest).
- **GloFAS** — Global Flood Awareness System (river discharge; CWC proxy via Open-Meteo).
- **GDACS / EONET / FIRMS** — UN/EU disaster alerts / NASA natural-event tracker / NASA fire hotspots.
- **NCS/IMD/CWC/NDMA/SACHET** — India's seismology / meteorology / water commission / disaster authority / alert system.
- **dedup_hash** — deterministic per-event key for upsert.
- **WKT/EWKB** — PostGIS geometry text/binary encodings.
- **RLS** — Row-Level Security.
- **VRP** — Vehicle Routing Problem (OR-Tools).
- **drift guard** — CI check that `schema.sql` == migrations' produced schema.

---

*Companion docs: `PROJECT_DOCUMENTATION.md` (narrative overview), `WORKPLAN_NEXT_PHASE.md`, `PHASE1_TICKETS.md`, `PROJECT_SCORECARD.md`, `DEPLOY_CHECKLIST.md`, `docs/rls_matrix.md`, `WORKLOG_TODAY.md`.*
