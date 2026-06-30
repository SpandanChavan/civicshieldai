# CivicShield AI — Complete Feature Inventory

Every feature, small and large, with what it does and where it lives. Grouped by area. Status legend: ✅ working/verified · ⚠️ works with caveat · 🐞 known bug being tracked · 🧪 demo/heuristic.

---

## 1. Hazard data ingestion (backend cron)

| Feature | What it does | Source/file | Status |
|---|---|---|---|
| USGS global earthquakes | Polls USGS FDSN every 5 min (mag ≥4.0), maps magnitude→severity | `services/usgsEarthquake.js` | ✅ |
| NCS India earthquakes | USGS FDSN bounded to India bbox (68–98°E, 6–38°N), mag ≥3.0, BIS seismic-zone lookup + zone-threshold severity | `services/ncs.js` | ✅ |
| NASA FIRMS fire hotspots | VIIRS SNPP NRT CSV over India bbox, FRP→severity; needs `FIRMS_API_KEY` | `services/nasaFirms.js` | ✅ |
| GDACS global alerts | GDACS RSS (EQ/FL/TC/TS/VO/DR/WF/LS), alert level→severity | `services/gdacs.js` | ✅ |
| NASA EONET events | Open natural events, category normalization | `services/gdacs.js` | ✅ |
| GDACS India bbox | India-filtered GDACS event list | `services/india-alerts.js` | ✅ |
| FloodList India RSS | India-tagged flood news, state-keyword → centroid coords (+jitter) | `services/india-alerts.js` | ✅ |
| IMD weather hazards | Open-Meteo for 18 Indian cities: heatwave, cold wave, extreme rainfall, cyclone wind (season-aware) | `services/imd.js` | ✅ |
| CWC river floods | Open-Meteo GloFAS discharge for 18 river gauge stations vs high/danger thresholds | `services/cwc.js` | ✅ |
| Scheduled polling | node-cron per-source schedules + initial fetch 3s after boot | `cron/apiPollers.js` | ✅ |
| Redis caching | Cache-then-fetch per source (Upstash); degrades to no-cache | `services/cacheService.js` | ✅ |
| Stale-event cleanup | Hourly TTL deactivation (quake 48h, wildfire 72h, else 7d) | `cron/apiPollers.js` | ✅ |
| Dedup | Upsert on `dedup_hash`; global USGS skips India bbox (NCS owns it) | `cron/apiPollers.js` | ✅ |
| Per-event state resolution | `get_state_from_point` resolves `state_id` on upsert, cached by rounded coords | `cron/apiPollers.js` | ✅ |

## 2. Event model & API

| Feature | What it does | File | Status |
|---|---|---|---|
| Unified event schema | source, type, severity, title, description, GEOGRAPHY location, raw_data, is_active, dedup_hash, state_id, alerted_at | `supabase/schema.sql` | ✅ |
| List events | `GET /api/events`; coordinator state-scoped; EWKB→lat/lon parsing; 30s cache | `routes/events.js` | ✅ |
| Diverse mode | `mode=diverse` returns top-N per event type for a balanced map | `routes/events.js` | ⚠️ recency cap can starve old India events (see §13) |
| Event stats | `GET /api/events/stats/summary` counts by type/severity (60s cache) | `routes/events.js` | ✅ |
| Single event / deactivate | `GET /:id`, `PATCH /:id/deactivate` | `routes/events.js` | ✅ |

## 3. Maps & geospatial visualization (frontend)

| Feature | What it does | File | Status |
|---|---|---|---|
| Leaflet base map | OSM tiles, India-centered (zoom 5), custom zoom/scale controls | `components/map/DisasterMap.jsx` | ✅ |
| Event markers | DivIcon per event: severity color ring + type icon (Activity/Flame/Waves/Wind/etc.) + critical pulse badge; popup with details | `components/map/DisasterMap.jsx`, `utils/geoHelpers.js` | ✅ |
| Coordinate parsing | lat/lon from backend, EWKB hex, WKT, {lat,lon}, or raw_data array | `utils/geoHelpers.js` | ✅ |
| India state boundaries | Datameet GeoJSON overlay; per-state IMD alert color; click-to-filter; tooltips | `components/map/IndiaMapLayer.jsx` | ✅ |
| BIS seismic zone overlay | IS 1893 zones II–V as translucent polygons + tooltips; toggleable | `components/map/SeismicZoneLayer.jsx` | ✅ |
| State-click filter | Click an Indian state → fit bounds + filter events to that state's bbox | `IndiaMapLayer.jsx` + `DisasterMap.jsx` | ✅ |
| Coordinator jurisdiction filter | Map auto-fits + filters to the coordinator's assigned state bbox | `DisasterMap.jsx` | ✅ |
| User location marker | "You are here" pulsing marker | `DisasterMap.jsx` | ✅ |
| Evacuation routing | Draws route geometry from routing API between two points | `DisasterMap.jsx`, `services/backendApi.js` | ✅ |
| OSM POI fetch | Hospitals/shelters/fire/police via Overpass API for a bounds | `utils/geoHelpers.js` | ✅ |
| India events vanishing | Markers flash then disappear (~1s) — diverse-feed recency cap dropping old India events | — | 🐞 tracked |

## 4. Real-time

| Feature | What it does | File | Status |
|---|---|---|---|
| Socket.io broadcasts | `events:updated` to `public` room on each ingestion cycle | `app.js`, `cron/apiPollers.js` | ✅ |
| Socket JWT handshake | `io.use()` verifies Supabase JWT; joins `public`/`role:*`/`state:*` rooms server-side | `app.js` | ✅ |
| Supabase Realtime | Browser subscribes to `events` INSERTs (postgres_changes) → store + toast | `hooks/useDisasterEvents.js` | ✅ |
| Triple-redundant feed | REST poll + Supabase Realtime + Socket.io merged into one Zustand store | `hooks/useDisasterEvents.js` | ✅ |

## 5. Alerts & notifications

| Feature | What it does | File | Status |
|---|---|---|---|
| Alert CRUD | List/get/create/delete alerts; coordinator state-scoped; Zod-validated | `routes/alerts.js` | ✅ |
| Async multi-channel dispatch | Create as draft → route channels async → log per-recipient → mark sent/failed | `routes/alerts.js` | ✅ |
| Email (Resend) | HTML alert email, XSS-escaped, CRLF-safe subject | `services/notificationRouter.js` | ✅ |
| Telegram (Telegraf) | HTML-mode message, escaped | `notificationRouter.js` | ✅ |
| WhatsApp (Twilio) | WhatsApp message with `whatsapp:` prefix handling | `notificationRouter.js` | ✅ |
| SMS (Twilio) | Dedicated `TWILIO_SMS_NUMBER` (no WhatsApp-sandbox fallback) | `notificationRouter.js` | ✅ |
| Web Push (web-push) | VAPID; reshapes stored `{endpoint,p256dh,auth}` → SDK shape; broadcasts to subscriptions | `notificationRouter.js`, `routes/alerts.js` | ✅ |
| Push subscribe | `POST /api/alerts/subscribe` stores browser PushSubscription | `routes/alerts.js`, `utils/pushService.js` | ✅ |
| Multilingual translation | LibreTranslate (hi/ta/te/bn/gu/mr/pa); skipped if URL unset | `notificationRouter.js` | ⚠️ optional |
| Auto-alerting (SACHET proxy) | Cron auto-creates+sends alerts for new High/Critical India events; deterministic via `alerted_at` | `cron/apiPollers.js` | ✅ |
| Delivery logging | Every channel attempt → `alert_logs` (channel, recipient, delivered, error) | `routes/alerts.js` | ✅ |

## 6. Citizen features

| Feature | What it does | File | Status |
|---|---|---|---|
| Citizen portal | Authenticated citizen home | `pages/CitizenPortal.jsx` | ✅ |
| Submit incident report | Location + media + category; Zod-validated; rate-limited 5/10min; auto state_id geocode; status `pending_review` | `routes/incidents.js` | ✅ |
| View own reports | Citizens see only their own reports | `routes/incidents.js` | ✅ |
| Public portal | No-auth live map + sent alerts + resources + Intelligence Feed | `pages/PublicPortal.jsx` | ✅ |
| Back-to-portal nav | Styled citizen NavLink (Globe2 icon) | `components/shared/Navbar.jsx` | ✅ |

## 7. Coordinator features

| Feature | What it does | File | Status |
|---|---|---|---|
| Coordinator dashboard | State-scoped operations view | `pages/CoordinatorDashboard.jsx` | ✅ |
| Review queue | Pending reports for the coordinator's state | `routes/incidents.js` (`/pending`), `components/dashboard/ReportsQueue.jsx` | ✅ |
| Approve report → event | Pick event_type + severity → inserts real `events` row (location parsed hex→WKT) → links `event_id` → plots on map | `routes/incidents.js` `/approve`, `ReportsQueue.jsx`, `utils/geoHelpers.js` (backend) | ✅ (fixed this session) |
| Reject report | Requires reason ≥5 chars; sets reviewer/timestamp | `routes/incidents.js` `/reject` | ✅ |
| Legacy status patch | `PATCH /:id/status` (coordinator/admin, state-ownership checked) | `routes/incidents.js` | ✅ |
| Create/send alerts | Coordinator-authored alerts, auto-tagged to state | `routes/alerts.js` | ✅ |
| Manage resources | CRUD emergency resources, state-scoped | `routes/resources.js` | ✅ |

## 8. Admin features

| Feature | What it does | File | Status |
|---|---|---|---|
| Admin dashboard | Nationwide oversight | `pages/AdminDashboard.jsx` | ✅ |
| Nationwide stats | Totals + per-state breakdown of events/reports/alerts/coordinators | `routes/admin.js` `/stats` | ✅ |
| Coordinator management | List coordinators, assign state | `routes/admin.js`, `pages/AdminCoordinators.jsx` | ✅ |
| User management | List users, change role/state | `routes/admin.js` | ✅ |
| Audit logs | View action log; admin-only | `routes/admin.js`, `utils/auditLogger.js` | ✅ |

## 9. SOS emergency feature

| Feature | What it does | File | Status |
|---|---|---|---|
| SOS button | Citizen one-tap emergency send (in-app UI, no native dialogs) | `components/sos/SOSButton.jsx` | ✅ |
| SOS alert panel | Coordinator sees SOS; inline acknowledge/resolve with confirm + error banner | `components/sos/SOSAlertPanel.jsx` | ✅ |
| Nearest safe zones | Surfaces nearby shelters/hospitals | `components/sos/NearestSafeZones.jsx` | ✅ |
| SOS status banner | Live status to the sender | `components/sos/SOSStatusBanner.jsx` | ✅ |
| SOS routing/notify | Backend route + SMS to emergency contacts + socket room push | `routes/sos.js`, `notificationRouter.js`, `app.js` | ✅ |

## 10. AI / ML / predictions

| Feature | What it does | File | Status |
|---|---|---|---|
| Risk forecasting | Facebook Prophet (linear fallback) multi-day forecast → risk level + confidence | `ml-service/.../prophet_service.py`, `routers/predict.py` | ✅ |
| Severity classification | Rule-based thresholds per event type + weighted feature score | `routers/classify.py`, `sklearn_service.py` | 🧪 rules |
| Misinformation detection | Regex/keyword patterns + source-credibility allow-list | `routers/classify.py`, `sklearn_service.py` | 🧪 rules |
| India flood-risk | Prophet vs CWC danger level (real GloFAS data) | `routers/india.py`, `routes/predictions.js` | ✅ |
| India earthquake-risk | NDMA zone score + Gutenberg-Richter weighting (real USGS history) | `routers/india.py`, `routes/predictions.js` | ✅ |
| India heatwave-risk | IMD anomaly thresholds + sigmoid probability (real Open-Meteo temps) | `routers/india.py`, `routes/predictions.js` | ✅ |
| Misinformation history | Persists checks + `GET /history` | `routes/predictions.js` | ✅ |
| Demo fallbacks | `demo:true` flag when upstream data unavailable | `routes/predictions.js` | ✅ |

## 11. Resource optimization

| Feature | What it does | File | Status |
|---|---|---|---|
| Vehicle routing (VRP) | Google OR-Tools route optimization (greedy fallback) | `ml-service/.../ortools_service.py`, `routers/optimize.py` | ✅ |
| Resource allocation | Greedy nearest allocation, consumes supply, reports unmet + fulfillment rate | `ortools_service.py` | ✅ |

## 12. Auth, roles & security

| Feature | What it does | File | Status |
|---|---|---|---|
| Supabase Auth | Email/password; profile auto-created on signup (unified trigger) | `supabase` + `hooks/useAuth.jsx` | ✅ |
| Role/state resolution | `stateScope` verifies JWT → role/state on req; 60s profile cache | `middleware/stateScope.js` | ✅ |
| RBAC enforcement | Per-route role checks; admin-guarded admin routes; destructive routes coordinator/admin only | route files | ✅ |
| Protected routes | Frontend role-gated routing + role-home redirects | `App.jsx`, `components/shared/ProtectedRoute.jsx` | ✅ |
| Row-Level Security | Per-table RLS, least-privilege grants (anon SELECT only; no TRUNCATE), service-role bypass | `supabase/schema.sql`, migrations 008/009, `docs/rls_matrix.md` | ✅ |
| CORS allow-list | Express + Socket.io restricted to `ALLOWED_ORIGINS` | `app.js` | ⚠️ must include current LAN IP for mobile |
| Rate limiting | Global limiter + per-route (incident submit 5/10min) | `app.js`, `routes/incidents.js` | ✅ |
| Helmet + XSS escaping | Security headers; alert content escaped | `app.js`, `notificationRouter.js` | ✅ |
| Audit logging | Signup, alert, incident, resource actions → `audit_logs` | `utils/auditLogger.js` | ✅ |

## 13. PWA / offline / UX

| Feature | What it does | File | Status |
|---|---|---|---|
| Installable PWA | Manifest + vite-plugin-pwa | `frontend/index.html`, vite config | ✅ |
| Service worker | Offline fallback, cache-first map tiles, push handling, IndexedDB background sync | `public/sw.js` | ✅ |
| Push registration | Registers SW, requests permission, subscribes via VAPID, posts to backend | `utils/pushService.js` | ✅ |
| Responsive navbar | `isMobile` breakpoint, hamburger drawer, high z-index | `components/shared/Navbar.jsx` | ✅ |
| PWA install banner | Prompt to install | `components/shared/PWAInstallBanner.jsx` | ✅ |
| Intelligence Feed panel | Side panel of live events; mobile-responsive width | `pages/PublicPortal.jsx` | ⚠️ cache-refresh retest pending |
| Favicon | `favicon.svg` | `public/` | 🐞 missing file |
| 3D Earth globe | Three.js landing-page globe (day/spec/normal/cloud textures) | `pages/LandingPage.jsx`, `public/textures/` | ✅ |
| Charts | Chart.js dashboards | `react-chartjs-2` | ✅ |
| Exports | jsPDF + XLSX report export | `jspdf`, `xlsx` | ✅ |
| Animations | framer-motion transitions | `framer-motion` | ✅ |
| Error monitoring | Sentry (frontend + backend) | `main.jsx`, `app.js` | ✅ |

## 14. State management (frontend)

| Feature | What it does | File | Status |
|---|---|---|---|
| Zustand store | events, stats, filters, connection status, notifications, selected event, user location | `store/useAppStore.js` | ✅ |
| TanStack Query | Server-state caching, refetch, retry/backoff | `App.jsx`, `useDisasterEvents.js` | ✅ |
| Auth context | user/role/profile (+ state bbox), loading-before-redirect fix | `hooks/useAuth.jsx` | ✅ |

## 15. Database, migrations & functions

| Feature | What it does | File | Status |
|---|---|---|---|
| PostGIS geospatial | GEOGRAPHY columns, GIST indexes, WKT/EWKB | `schema.sql` | ✅ |
| `get_state_from_point` | bbox point-in-state resolver | migration 006 / schema.sql | ✅ |
| `handle_new_user_unified` | Signup → profile + audit row | migration 006 | ✅ |
| `updated_at` triggers | Auto-touch on events/resources | schema.sql | ✅ |
| 36 states seed | All Indian states/UTs with bboxes | migration 006 / schema.sql | ✅ |
| Migrations 001–009 | Full schema evolution incl. RLS hardening + drift reconciliation | `supabase/migrations/` | ✅ |
| Consolidated schema | Authoritative fresh-DB `schema.sql` | `supabase/schema.sql` | ✅ |

## 16. DevOps / CI / docs

| Feature | What it does | File | Status |
|---|---|---|---|
| CI pipeline | Backend lint+test (local Supabase stack), frontend lint+test+build, ML import smoke, secret scan | `.github/workflows/ci.yml` | ✅ |
| Integration tests | RLS audit + smoke + e2e against a real local Supabase stack | `backend/tests/integration/` | ✅ |
| Schema drift guard | Fails CI if `schema.sql` diverges from migrations | `ci.yml` | ✅ |
| Deterministic deps | Pinned supabase-js + committed lockfile | `package.json` | ✅ |
| Doc set | Technical reference, project doc, workplan, scorecard, deploy checklist, RLS matrix, phase tickets, worklog, this inventory | repo root + `docs/` | ✅ |

---

## Known issues (cross-referenced)
- 🐞 India markers flash-then-disappear — `mode=diverse` recency cap evicting old India events.
- ⚠️ Mobile data depends on `ALLOWED_ORIGINS` + `VITE_SUPABASE_URL` matching the current LAN IP (breaks on DHCP change).
- 🐞 Missing `public/favicon.svg`; stale `dist/` builds.
- 🧪 Severity/misinformation are rule-based (labeled), not validated ML.
- ⚠️ Production DB is divergent (more advanced state-scoped RLS than code) — deploy of 008/009 paused pending the canonical-RLS decision (see `DEPLOY_CHECKLIST.md` / `TECHNICAL_REFERENCE.md` §16).

*For deep implementation detail see `TECHNICAL_REFERENCE.md`; for status/scores see `PROJECT_SCORECARD.md`.*
