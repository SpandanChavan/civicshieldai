# CivicShield AI — Engineering Review & Required Fixes

**Reviewer:** Project Manager (senior)
**Date:** 2026-06-21
**Verdict:** **NOT deployable.** The data ingestion and the ML/optimization cores are real and competent. But the database schema does not match the application code, several "AI prediction" endpoints run on fabricated inputs, and there are unauthenticated destructive routes. As shipped, signup → report → review → alert and the entire state/coordinator/admin system cannot function.

**How to use this document.** Fix items in order of severity. For **every** item, you must fill in the "Evidence required" block. "Done" without evidence will be rejected. I will re-review against the acceptance criteria and re-run the repro steps myself.

**Ground rules (read before you reply):**
- Do not mark anything `[x]` unless the acceptance criteria are met *and* you have pasted the requested evidence (SQL output, curl/HTTP response, screenshot, test run, or diff).
- "It works on my machine" is not evidence. Run against a **fresh** database created only from the migrations in this repo.
- If you disagree with a finding, say so explicitly with proof — do not silently skip it.
- Headers in your last migrations literally said "All Issues Fixed." They were not. Claims will be verified line by line.

---

## SEVERITY LEGEND
- 🔴 **BLOCKER** — feature is dead on arrival / security hole. Must fix before any deploy.
- 🟠 **MAJOR** — wrong behavior, fake data, or serious perf/security smell.
- 🟡 **MINOR** — correctness/hygiene; fix before "production quality" sign-off.

---

## 🔴 BLOCKERS

### B1 — `states` table is never created, but the whole geo/role system depends on it
- **Where:** `backend/src/routes/states.js` (`from('states').select('id, name, code, capital, bbox_north, bbox_south, bbox_east, bbox_west')`); joins `states(name, code)` in `backend/src/routes/admin.js`.
- **Problem:** No migration (001–005) creates a `states` table. `GET /api/states` always 500s; every coordinator/admin state join fails.
- **Required fix:** Create the `states` table (id, name, code, capital, bbox_north/south/east/west) and seed it with the Indian states/UTs you actually use. Add it to the consolidated migration (see B7).
- **Acceptance criteria:** On a fresh DB, `GET /api/states` returns the seeded rows (200).
- **Evidence required:** Paste the `curl` response of `GET /api/states` and the `SELECT count(*) FROM states;` output.
- **Status:** [ ] Fixed — _engineer notes:_

### B2 — `state_id` referenced across 7 files but exists on zero tables
- **Where:** `stateScope.js` (`user_profiles.state_id`), `incidents.js`, `alerts.js`, `admin.js`, `events`/`resources` queries.
- **Problem:** 002 creates `user_profiles` with no `state_id`; 005 patches `incident_reports`/`events` but never adds `state_id` anywhere. Coordinator scoping filters on a non-existent column.
- **Required fix:** Add `state_id UUID REFERENCES states(id)` to `user_profiles`, `events`, `alerts`, `incident_reports`. Backfill/strategy for existing rows. Ensure the cron upsert and incident insert actually populate it.
- **Acceptance criteria:** A coordinator with an assigned state sees only their state's alerts/incidents; an admin sees all.
- **Evidence required:** Two `curl` calls (coordinator JWT vs admin JWT) to `GET /api/incidents` showing different scoped result sets, plus the `\d user_profiles` / `\d incident_reports` describing the new column.
- **Status:** [ ] Fixed — _engineer notes:_

### B3 — Incident workflow violates its own schema (CHECK constraint + missing columns)
- **Where:** `backend/src/routes/incidents.js`.
- **Problem:** `incident_reports.status` CHECK is `('pending','verified','rejected','resolved')` (001, never altered). Code writes `'pending_review'`, `'under_review'`, `'approved'`. Code also writes `reviewer_id`, `reviewed_at`, `rejection_reason`, `state_id` — none created in any migration. Every insert/approve/reject throws.
- **Required fix:** Decide the canonical status set and make schema + code agree. Add the missing columns. Update the CHECK constraint.
- **Acceptance criteria:** Submit a report (citizen) → approve (coordinator) → reject another (coordinator) all succeed; DB rows reflect the new statuses and reviewer fields.
- **Evidence required:** The three HTTP responses (201 / 200 / 200) and a `SELECT id, status, reviewer_id, reviewed_at, rejection_reason FROM incident_reports;` dump for those rows.
- **Status:** [ ] Fixed — _engineer notes:_

### B4 — Migration `005_schema_patch.sql` crashes: `misinformation_checks` is never created
- **Where:** `005_schema_patch.sql` line ~97 `ALTER TABLE misinformation_checks ENABLE ROW LEVEL SECURITY`; also `ALTER TABLE`/constraints on it; `predictions.js` inserts into it.
- **Problem:** No migration `CREATE`s `misinformation_checks`, so 005 errors and later FIXes may not apply. Misinfo history is silently empty.
- **Required fix:** Create `misinformation_checks` (with the columns predictions.js writes: `input_text, credibility_score, classification, confidence, is_misinformation, explanation, analyzed_at, report_id`) **before** any ALTER on it.
- **Acceptance criteria:** Full migration runs top-to-bottom on a fresh DB with zero errors; `POST /api/predictions/misinformation` persists and `GET .../history` returns it.
- **Evidence required:** Clean migration run log (no errors) + the history endpoint response showing the saved row.
- **Status:** [ ] Fixed — _engineer notes:_

### B5 — Web Push is broken on both ends
- **Where:** `backend/src/routes/alerts.js` `/subscribe` inserts `{ endpoint, keys }`; table `push_subscriptions` (005) has NOT NULL `p256dh`, `auth`, no `keys` column. `notificationRouter.sendWebPush` passes the flat row to `webpush.sendNotification`, which needs `{ endpoint, keys: { p256dh, auth } }`.
- **Required fix:** Align subscribe insert with the table (`p256dh`, `auth`), and reshape the row to `{ endpoint, keys: { p256dh, auth } }` before sending. Attach `user_id`.
- **Acceptance criteria:** Subscribe from a browser, fire a test alert, receive the push.
- **Evidence required:** `SELECT endpoint, p256dh IS NOT NULL, auth IS NOT NULL FROM push_subscriptions;` and a screenshot/console log of a delivered push (or a successful `web-push` send result).
- **Status:** [ ] Fixed — _engineer notes:_

### B6 — `get_state_from_point` RPC called but never defined
- **Where:** `incidents.js` (`getDb().rpc('get_state_from_point', { lat, lon })`).
- **Problem:** Function doesn't exist; the try/catch hides the failure so `state_id` is always null.
- **Required fix:** Implement the Postgres function (PostGIS point-in-polygon against `states` bbox or geometry) and return the matching state id.
- **Acceptance criteria:** Submitting a report with coordinates inside a known state sets the correct `state_id`.
- **Evidence required:** `SELECT get_state_from_point(28.61, 77.20);` returning Delhi's id, plus the resulting incident row's `state_id`.
- **Status:** [ ] Fixed — _engineer notes:_

### B7 — Deliver ONE clean, idempotent, ordered migration set that provisions the real schema
- **Problem:** Current migrations are contradictory and order-dependent (002 vs 003 both define `on_auth_user_created`; 004 exists only to undo the mess; 002's role CHECK omits `admin` until 005). A fresh DB cannot be stood up reliably.
- **Required fix:** Reconcile into a migration sequence that runs cleanly start-to-finish on an empty database and produces a schema that matches the code (covers B1–B6).
- **Acceptance criteria:** `supabase db reset` (or equivalent fresh apply) completes with zero errors and the app boots and passes the smoke flow in B3.
- **Evidence required:** Full apply log + `\dt` table list.
- **Status:** [ ] Fixed — _engineer notes:_

### B8 — Unauthenticated destructive/state-changing routes
- **Where:** `DELETE /api/alerts/:id` (`alerts.js`) — no auth at all. `PATCH /api/incidents/:id/status` (legacy, `incidents.js`) — no auth at all.
- **Problem:** Anyone can delete any alert or change any report's status.
- **Required fix:** Require admin/coordinator role on both, or remove the legacy status route entirely.
- **Acceptance criteria:** Unauthenticated calls return 401/403; authorized calls succeed.
- **Evidence required:** `curl` showing 401/403 without a token and 200 with a proper role token, for both routes.
- **Status:** [ ] Fixed — _engineer notes:_

---

## 🟠 MAJOR

### M1 — "AI predictions" run on fabricated inputs
- **Where:** `backend/src/routes/predictions.js`: `/flood/:basinId` generates `Math.random()` history + hardcoded `danger_level: 28.5`; `/earthquake/:district` hardcodes `seismic_zone:'IV'`, `recent_magnitudes:[3.2,4.1,2.5]`; `/heatwave/:district` hardcodes `temperature_anomalies:[...]`.
- **Problem:** The ML math (`india.py`) is real, but it computes on invented numbers regardless of district/basin. This is fake output presented as prediction.
- **Required fix:** Feed real series (CWC/Open-Meteo discharge for flood, NCS/USGS history per district for earthquake, IMD/Open-Meteo anomalies for heatwave). If a demo fallback is unavoidable, label the response `"demo": true` and surface that in the UI.
- **Acceptance criteria:** Two different districts/basins return materially different inputs and outputs traceable to real source data.
- **Evidence required:** Request/response for two distinct districts showing different real inputs, and where the input data came from.
- **Status:** [ ] Fixed — _engineer notes:_

### M2 — `sklearn_service.py` claims ML but uses none; dead HuggingFace path
- **Where:** `ml-service/app/services/sklearn_service.py`.
- **Problem:** Severity = if/elif thresholds; misinformation = regex keyword match. `_call_huggingface` is defined but never called. Filename + docstrings claim scikit-learn / NLP.
- **Required fix:** Either (a) honestly rename/redocument as a rule-based classifier and delete dead code, or (b) actually wire in a model. Do not present rules as ML.
- **Acceptance criteria:** Code and docs accurately describe what runs; no unreachable code.
- **Evidence required:** Diff of the renamed/relabeled module (or the model integration) and confirmation the HF path is removed or actually used.
- **Status:** [ ] Fixed — _engineer notes:_

### M3 — CORS reflects any origin with credentials; Socket.io unscoped
- **Where:** `backend/src/app.js` (`origin: callback(null, true)` + `credentials: true`, Express and Socket.io); `ml-service/app/main.py` (`allow_origins=["*"]` + `allow_credentials=True`).
- **Required fix:** Restrict to an allow-list from env. Scope Socket.io broadcasts (rooms by role/state) instead of `io.emit` to everyone.
- **Acceptance criteria:** Requests from a non-allowed origin are rejected; sockets only receive events they're entitled to.
- **Evidence required:** Config diff + a test showing a disallowed origin blocked.
- **Status:** [ ] Fixed — _engineer notes:_

### M4 — `optimize_allocation` never decrements supply
- **Where:** `ml-service/app/services/ortools_service.py`.
- **Problem:** `available` is never reduced, so the same resource is assigned to every demand; `fulfillment_rate` is meaningless.
- **Required fix:** Remove/decrement assigned resources from the available pool; respect capacity/quantity.
- **Acceptance criteria:** With supply < demand, some demands are correctly `unmet` and no resource is double-assigned.
- **Evidence required:** A test case input + output proving no double assignment.
- **Status:** [ ] Fixed — _engineer notes:_

### M5 — Duplicate earthquake events
- **Where:** global USGS poller vs `ncs.js`, different `dedup_hash` prefixes for the same quake.
- **Required fix:** Unify dedup on USGS event id (or coordinate+time) so India quakes aren't inserted twice.
- **Acceptance criteria:** No duplicate rows for the same physical event.
- **Evidence required:** A query showing dedup behavior across both sources.
- **Status:** [ ] Fixed — _engineer notes:_

### M6 — No tests, despite jest/supertest/vitest configured
- **Where:** `backend/package.json`, `frontend/package.json` (test scripts exist; no test files).
- **Required fix:** Add a real smoke suite: auth, incident lifecycle, alert create/send, ML endpoints. Wire into CI.
- **Acceptance criteria:** `npm test` runs and passes meaningful assertions (not placeholders).
- **Evidence required:** Test run output with assertion counts.
- **Status:** [ ] Fixed — _engineer notes:_

---

## 🟡 MINOR

### m1 — `cwc.js` broken/dead template literal
- `backend/src/services/cwc.js` (~line 89): `desc` is built with a malformed template literal (`...${...}.toLocaleString('en-IN')}...` — method outside `${}`) and is never used. Remove it or fix it.
- **Evidence required:** Diff. **Status:** [ ]

### m2 — SMS uses a WhatsApp sandbox number
- `notificationRouter.js`: SMS `from` falls back to `+14155238886` (WhatsApp sandbox), which can't send SMS. Use a real SMS-capable sender or skip cleanly.
- **Evidence required:** Config + a successful/clean-skip SMS attempt log. **Status:** [ ]

### m3 — `translateText` defaults to `http://localhost:5000`
- Will always fail in prod. Make it env-driven and degrade gracefully.
- **Evidence required:** Config diff. **Status:** [ ]

### m4 — FloodList coordinates are randomly jittered
- `india-alerts.js` adds `Math.random()` jitter to lat/lon — fake precision on the map. Either drop the precision in the UI or place at state centroid honestly.
- **Evidence required:** Decision + diff. **Status:** [ ]

### m5 — New Supabase client created per request
- `auth.js`, `stateScope.js`, `admin.js`, `alerts.js`, `incidents.js`, `auditLogger.js`, health check. Use a shared singleton.
- **Evidence required:** Diff. **Status:** [ ]

### m6 — `stateScope` runs on every `/api` request with two network round-trips
- Even for public reads. Cache the profile or only resolve scope on routes that need it.
- **Evidence required:** Approach + diff. **Status:** [ ]

### m7 — `.env.example` out of sync with code
- Missing `TWILIO_*`, `VAPID_*`, `DEFAULT_TELEGRAM_CHAT_ID`, `DEFAULT_WHATSAPP_NUMBER`, `DEFAULT_SMS_NUMBER`, `LIBRETRANSLATE_URL`, etc. Document every env var the code reads.
- **Evidence required:** Updated file. **Status:** [ ]

---

## REQUIRED REPORT BACK (format)
For each item, reply with:
```
[B1] DONE / NOT DONE / DISAGREE
Commit/diff: <link or paste>
Evidence: <SQL output / curl response / test log / screenshot>
Notes: <anything I should know>
```
Include the full **fresh-DB migration apply log** and the **B3 smoke-flow** output at the top of your report — those two alone gate the deploy.

## OUT OF SCOPE FOR THIS REVIEW (disclosed)
The frontend React component tree was not fully audited (cloud-sync prevented file enumeration). Entry point, routing, and the Supabase client were reviewed. A frontend pass will follow once the backend/schema is green.
