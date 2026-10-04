# CivicShield AI — Examiner Q&A Guide

**Everything an examiner can ask, with the honest answer.**
Rule: never bluff. If you don't know, say "I don't know, but here's how I'd find out." Examiners reward that.

---

## 0. THE 30-SECOND PITCH (memorise this)

> India is one of the most disaster-prone countries in the world, but its hazard data is fragmented across agencies that expose no public APIs — and none of it is visible to ordinary citizens. CivicShield AI ingests 8 authoritative hazard feeds every few minutes, normalises them into one deduplicated geospatial event model, enriches them with AI, and pushes them live to three audiences: the public, state disaster coordinators, and national administrators. Citizens can also report incidents back, so information flows both ways.

**Four numbers to remember:** 8 data sources · 5 alert channels · 4 security layers · 36 states supported.

---

## 1. PROBLEM & MOTIVATION

**Q: Why did you choose this problem?**
India has 58% of its landmass in earthquake zones III–V, 12% flood-prone, and 7,516 km of cyclone-exposed coastline. Authoritative data exists — IMD, NCS, CWC, NDMA — but it is fragmented and machine-unreadable. There is no single real-time operational picture, and nothing at all facing the public.

**Q: Isn't this already solved by the government?**
Partly. NDMA runs SACHET for alerts, and ISRO/NRSC runs NDEM as the national geospatial repository. Both are excellent within their scope, but both are built for officials. SACHET is a client-rendered site with no API; NDEM is behind a credential + captcha login. Neither offers citizens a live map or a way to report back.

**Q: Who exactly benefits?**
Three groups: citizens (live hazard visibility, alerts in 7 languages, SOS, incident reporting), state coordinators (jurisdiction-scoped operations, review queue, alert dispatch, resource management), national admins (cross-state oversight, coordinator assignment, audit trail).

**Q: What is the real-world impact?**
Time-to-awareness. Golden-hour survival drops sharply after 60 minutes. We deliver alerts in under a second across 5 channels including SMS — which reaches feature phones with no internet, the demographic most at risk in rural India.

---

## 2. ARCHITECTURE

**Q: Describe your architecture.**
Three services plus a managed database.
1. **Backend** (Node.js/Express/Socket.io) — cron-based ingestion, REST API, real-time broadcasting, multi-channel alerting.
2. **ML service** (Python/FastAPI) — forecasting, classification, optimisation. Stateless and independently deployable.
3. **Frontend** (React/Vite) — public portal, citizen portal, coordinator dashboard, admin console. Installable PWA.
4. **Database** — PostgreSQL + PostGIS on Supabase, with Row-Level Security and Realtime.

**Q: Why three separate services instead of a monolith?**
Different runtimes and scaling profiles. The ML work is Python-native (Prophet, OR-Tools). The backend needs a persistent process for WebSockets and cron. Splitting them means the ML service can be down without taking the platform with it — which is exactly what our graceful-degradation design requires.

**Q: Why do you have THREE real-time channels? Isn't that redundant?**
Yes — deliberately. We merge REST polling, Supabase Realtime `postgres_changes`, and Socket.io pushes into one Zustand store. In an emergency system, a stale map is a safety failure. If one channel degrades, the other two keep the map current.

**Q: Walk me through what happens when an earthquake occurs.**
USGS publishes it → our cron poller fetches within 5 minutes → we normalise it into our event schema → compute a `dedup_hash` → resolve `state_id` via the PostGIS function `get_state_from_point` → the ML service re-scores severity → upsert into `events` → Socket.io emits `events:updated` to the public room AND Supabase Realtime fires a `postgres_changes` INSERT → every connected browser updates its map. If it's High/Critical and in India, the cron auto-creates an alert and dispatches it across 5 channels.

---

## 3. DATA SOURCES & THE INNOVATION

**Q: What are your data sources?**
Eight: USGS FDSN (earthquakes), NASA FIRMS (fire hotspots via VIIRS), GDACS (global multi-hazard RSS), NASA EONET (natural events), Open-Meteo Forecast (weather), Open-Meteo GloFAS (river flood), FloodList RSS (India flood news), and USGS bounded to the India bbox as an NCS proxy.

**Q: You said Indian agencies have no APIs. So how do you have India-specific data?** ⭐ *Strongest answer in the deck*
We engineered authoritative open substitutes:
- **NCS (seismology)** → USGS FDSN bounded to 68–98°E / 6–38°N, magnitude ≥3.0, with BIS seismic-zone severity mapping.
- **CWC (water commission)** → Open-Meteo GloFAS across 18 river gauge stations. GloFAS is the *same underlying model CWC itself relies on*.
- **IMD (meteorology)** → Open-Meteo across 18 Indian cities with season-aware thresholds for heatwave, cold wave, extreme rainfall, cyclone wind.
- **SACHET (NDMA alerts)** → our own auto-alert pipeline that dispatches High/Critical India events.

We attribute every substitute transparently. We never claim to be reading official Indian feeds.

**Q: How do you prevent duplicate events?**
Two mechanisms. First, a deterministic `dedup_hash` used as a unique upsert key. Second, source partitioning — the *global* USGS poller explicitly **excludes** the India bounding box, so Indian earthquakes are owned solely by the NCS-proxy poller. Without that, the same quake would appear twice with conflicting severities.

**Q: What if a data source goes down?**
Each poller is independently scheduled and individually wrapped in error handling — one failure cannot stall the others. The ingestion health panel surfaces the failing source with its timestamp and error message. Stale events auto-deactivate by TTL (earthquakes 48h, wildfires 72h, everything else 7 days).

---

## 4. AI / ML — **THE MOST LIKELY ATTACK VECTOR**

**Q: Is this real machine learning, or just if-else rules?** ⭐ *Answer directly, no defensiveness*
Both, and we label which is which in code, docs, and UI:

| Component | What it actually is | Honest label |
|---|---|---|
| **Photo classifier** | HuggingFace Inference API, ResNet-50 | Genuine ML |
| **Risk forecasting** | Facebook Prophet time-series | Validated statistical model |
| **Severity classification** | Threshold rules per event type | Rule-based |
| **Misinformation detection** | Regex + source-credibility allow-list | Rule-based |
| **Resource optimisation** | Google OR-Tools VRP solver | Classical optimisation |

Our own `FEATURES.md` marks the rule-based ones with a 🧪 flag. We'd rather be accurate than impressive.

**Q: Your photo classifier uses ResNet-50 — that's trained on ImageNet, not disasters.**
Correct, and that's exactly why we present its output to coordinators as an **"AI suggestion"** rather than a decision. A coordinator always reviews before anything is published. In our live test it labelled a flood photo "amphibian, amphibious vehicle" with 0.67 confidence — which is precisely why a human stays in the loop.

**Q: What's your model accuracy?**
We have not published accuracy metrics. That is the single biggest gap in the project and the top item on our roadmap. Producing them needs a labelled disaster-image dataset and a proper train/validation split — which we scoped as beyond this phase rather than fake.

**Q: How would you improve the ML?**
Fine-tune a vision model on a labelled disaster-damage dataset (e.g. xBD), publish precision/recall per damage class, and replace the rule-based severity classifier with a model trained on historical event outcomes. Also add confidence calibration so the score is meaningful rather than heuristic.

**Q: How does Prophet work here?**
Prophet decomposes a time series into trend, seasonality, and holiday effects. We feed it historical hazard data with yearly and weekly seasonality and an 80% confidence interval, then map the peak forecast value to a risk level using per-event-type thresholds. If Prophet isn't installed, we fall back to linear extrapolation via `numpy.polyfit`.

**Q: What is the confidence-gating on severity?**
The ML service re-scores every ingested event. We override the source's severity **only** when ML confidence ≥ 0.80 and the result differs. Below that threshold, the original authoritative value stands. If the ML service is unreachable, we degrade silently and keep the source value.

---

## 5. DATABASE & GEOSPATIAL

**Q: Why PostGIS instead of just storing lat/lon columns?**
Because we do genuine spatial work: point-in-polygon state resolution, bounding-box filtering, and GIST-indexed proximity queries. Storage is `GEOGRAPHY(POINT, 4326)` — WGS-84. Two float columns cannot do indexed spatial joins.

**Q: Explain `get_state_from_point`.**
A PostgreSQL function that takes a lat/lon and returns the UUID of the Indian state whose bounding box contains it, picking the smallest-area match when boxes overlap. It runs on every event and every incident report so everything is jurisdiction-scoped automatically.

**Q: What's your schema?**
Core tables: `events`, `alerts`, `alert_logs`, `resources`, `incident_reports`. Auth/meta: `user_profiles`, `states` (36 seeded with bboxes), `audit_logs`, `misinformation_checks`, `push_subscriptions`. 15 versioned migrations, all applied via the Supabase CLI so they're recorded in `schema_migrations`.

**Q: How do you handle schema changes?**
Every DB change is a numbered migration **and** a matching update to `schema.sql`. Our CI has a **schema drift guard** that applies migrations and `schema.sql` to two separate databases, dumps both, and fails the build on any statement-level difference.

**Q: Did that guard ever actually catch anything?** ⭐ *Great answer*
Yes — on its first run. It exposed real pre-existing drift: an invalid `status` default that violated a CHECK constraint, three stale trigger functions, and four over-permissive RLS policies including a publicly-readable `user_profiles` table. All reconciled in migration 009. That's a security bug we didn't know we had.

---

## 6. SECURITY

**Q: How do you handle authentication and authorisation?**
Four independent layers:
1. **Identity** — Supabase Auth issues JWTs. A DB trigger auto-creates `user_profiles` with default role `citizen`; privilege can't be self-assigned at signup.
2. **API** — `stateScope` middleware verifies the JWT and loads role/state server-side. Route handlers enforce role checks.
3. **Database** — PostgreSQL Row-Level Security on every table, least-privilege grants. The `anon` role has SELECT only.
4. **Real-time** — the Socket.io handshake verifies the JWT before assigning rooms; rooms are server-assigned from verified claims.

**Q: Can a coordinator from Maharashtra see Kerala's data?**
No — blocked at all four layers independently. Even if someone bypassed our API entirely and hit Postgres directly with the anon key, RLS blocks the read. That's what defence in depth means concretely.

**Q: Can a client fake their role?**
No. The client never asserts its own role. The backend reads the JWT, then fetches the profile server-side with the service key. Socket.io rooms are assigned from those verified values, not from anything the client sends.

**Q: What about injection and XSS?**
Zod schema validation on every write route with strict object parsing. Supabase's client parameterises queries. Alert content is HTML-escaped before dispatch. Helmet sets security headers. Rate limiting is global plus per-route (incident submission capped at 5 per 10 minutes).

**Q: Have you ever leaked credentials?**
No. No `.env` file has ever been committed — verifiable with `git ls-files`. CI includes a secret-scanning gate that fails the build on credential patterns.

---

## 7. REAL-TIME & SCALE

**Q: How does real-time actually work?**
Socket.io with room-based scoping. On connect, the handshake verifies the Supabase JWT, then the server joins the socket to `public`, `role:<role>`, and `state:<uuid>`. When the cron ingests events it emits `events:updated` to the `public` room. SOS alerts emit only to the sender's `state:<uuid>` room, so a Kerala SOS never reaches a Maharashtra coordinator.

**Q: How many concurrent users can this handle?**
We haven't load-tested, so I won't invent a number. Architecturally the bottlenecks are Socket.io connections per backend instance and Supabase connection pooling. Scaling path: horizontal backend instances behind a Redis Socket.io adapter for cross-instance room broadcasting, plus Supabase connection pooling. Load testing is on the roadmap.

**Q: Why can't you deploy the backend on Vercel?**
Two hard blockers. Socket.io needs a persistent process; Vercel's serverless functions terminate after each request. And our 9 cron pollers need a long-running host. So frontend goes to Vercel, backend and ML go to Render as persistent web services.

---

## 8. FEATURES — RAPID FIRE

**Q: Walk me through the citizen report flow.**
Citizen submits description + location + photo → Zod validation → rate limit check → `get_state_from_point` resolves `state_id` → inserted with status `pending_review` → audit log written → **response returns immediately** → in the background the ML service classifies the photo and writes `ai_classification` → coordinator sees it in their state-scoped queue with an AI badge → approve creates a real `events` row that appears on the map, or reject requires a written reason ≥5 characters.

**Q: What if a citizen submits a false report?**
Reports never auto-publish. Every one needs explicit coordinator approval. Rate limited to 5 per 10 minutes. Full audit trail with reviewer ID and timestamp. Rejection requires written justification.

**Q: Explain the SOS feature.**
One tap from the citizen portal captures live GPS and posts to `/api/sos`. The backend writes the record, emits to the coordinator's `state:<uuid>` Socket.io room, and dispatches SMS to registered emergency contacts. The coordinator acknowledges then resolves, with inline confirmation UI. The sender sees a live status banner, and nearby shelters and hospitals are surfaced.

**Q: How does multi-channel alerting work?**
`routeAlert(alert, channels, recipients)` lazily initialises each provider only if its key exists. Channels: Web Push (VAPID), Telegram (Telegraf), WhatsApp and SMS (Twilio), Email (Resend). Every attempt writes an `alert_logs` row with recipient, delivered flag, and error message — surfaced in the coordinator UI as a delivery table. No silent failures.

**Q: What languages do you support?**
Alerts translate into Hindi, Tamil, Telugu, Bengali, Gujarati, Marathi, and Punjabi via LibreTranslate. Skipped gracefully if the service isn't configured. An English-only alert excludes most of the at-risk population.

**Q: What makes it a PWA?**
Web app manifest plus `vite-plugin-pwa`, and a custom service worker with offline fallback, cache-first map tiles, push notification handling, and IndexedDB background sync. Installs to home screen in under 2 MB.

---

## 9. TESTING & ENGINEERING PROCESS

**Q: How did you test this?**
Four enforcing CI gates on every pull request: backend lint + tests against a **real local Supabase stack** (not mocks), frontend lint + test + build, ML import smoke test, and secret scanning — plus the schema drift guard.

**Q: Are your tests actually meaningful, or just green?**
They've been proven to fail on real breaks. The RLS integration test went red on a genuine policy regression. The drift guard went red on a deliberate divergence. A gate that has never failed hasn't been proven.

**Q: What's your weakest area?**
Frontend test coverage — thin relative to backend integration coverage. And no published ML accuracy metrics. Both are on the roadmap and I'd rather state them than have you find them.

**Q: How do you handle failures gracefully?**
It's a design principle throughout. ML service down → incident submission still succeeds. Redis absent → requests resolve uncached. Prophet missing → linear extrapolation fallback. OR-Tools missing → greedy allocation fallback. Notification provider unconfigured → other channels still fire. In an emergency system, partial function must never become total failure.

---

## 10. COMPARISON — NDEM

**Q: How is this different from ISRO's NDEM?** ⭐ *Never claim to beat ISRO*

| Dimension | NDEM (ISRO/NRSC) | CivicShield AI |
|---|---|---|
| Users | Disaster managers, NDRF/SDRF, officials | Citizens + coordinators + admins |
| Public access | Credential + captcha login | Open portal, no login |
| Citizen reporting | None — one-directional | Geo-tagged reports + photos + SOS |
| Data foundation | **Satellite imagery — far deeper** | Open multi-source API aggregation |
| Updates | Product-cycle bulletins | 5-min polling, sub-second push |
| Mobile/offline | Desktop portal | Installable PWA with offline cache |

**The line to say:** "We don't claim to replace NDEM — it has satellite assets and institutional authority we cannot match. We fill the gap it structurally leaves open: the citizen-facing, real-time, bi-directional layer. NDEM is the authoritative backbone; CivicShield is the public nervous system."

---

## 11. HARD / TRICK QUESTIONS

**Q: What's the hardest bug you fixed?**
A route-ordering bug in Express. `GET /api/events/ingestion-health` was registered *after* `GET /api/events/:id`, so Express matched "ingestion-health" as an event ID and the handler was unreachable. It returned a confusing 500 rather than a 404. Fixed by moving it above `/:id` — the same pattern already documented for `/stats/summary` in that file.

**Q: What would you do differently?**
Start with the schema drift guard rather than adding it in phase 1.6. It found real bugs immediately; having it from day one would have prevented the drift accumulating. I'd also have written frontend tests alongside components instead of deferring them.

**Q: Is this production-ready?**
Not yet, and I won't claim it is. It's production-*intent*: real CI gates, RLS, audit logging, graceful degradation. What's missing before real deployment is a tested backup/restore runbook, load testing, published ML metrics, and reconciling the production schema — our prod DB currently carries *more advanced* state-scoped RLS than the codebase, and we deliberately have not force-pushed over it.

**Q: What's the single biggest limitation?**
No validated ML accuracy. We use the term "AI" honestly — one genuine ML model, one statistical model, and rule-based classifiers we label as such — but we can't quantify how well the ML performs on disaster imagery specifically.

**Q: How long did this take, and what was the split?**
[Fill in your own timeline and team split honestly.]

**Q: What did you personally build?**
[Answer specifically. Name files and features you actually wrote. Examiners check this.]

---

## 12. LIVE DEMO — RUNNING SYSTEM

**URLs:** Frontend `http://localhost:3000` · Backend `http://localhost:4000` · ML `http://localhost:8000` · Supabase `http://127.0.0.1:54321` · Phone `http://192.168.100.190:3000`

**Proof points if challenged that data is fake:**
- `http://localhost:4000/health` → returns `database: connected`, `ml_service: online`, plus the live CORS allow-list
- **Ingestion Health panel** in the coordinator dashboard → per-source last-run timestamps and event counts
- `http://localhost:8000/docs` → live FastAPI Swagger UI
- Event titles reference real places and real timestamps

**If something breaks mid-demo:** say what you *expected* to happen and why, then move on. Examiners grade composure and diagnostic thinking, not luck.

---

## 13. THINGS TO NEVER SAY

- ❌ "It uses AI" (vague) → ✅ name the specific model and what type it is
- ❌ "It's fully accurate" → ✅ "We haven't published accuracy metrics; that's our top gap"
- ❌ "It's better than NDEM" → ✅ "It's complementary — different users, different problem"
- ❌ "It's production ready" → ✅ "Production-intent; here's exactly what's missing"
- ❌ Guessing a number you don't know → ✅ "I don't know, here's how I'd measure it"

---

## 14. CLOSING LINE

> An emergency system that overstates its own reliability is dangerous. Every heuristic in this project is labelled a heuristic — in the code, the documentation, and the user interface. We'd rather be evaluated on what we actually built than on what we could claim.
