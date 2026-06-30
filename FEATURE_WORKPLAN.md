# CivicShield AI — Feature Implementation Workplan

**Scope:** the features from `civicshield-feature-implementation-guide.md` (Categories A–E).
**Decision on record:** of Category E, only **E1 (AI Photo Classifier)** is being pursued; E2–E10 are skip/defer unless explicitly revived (E10 is the one cheap exception). Several A/B items are high-value and included.
**Author:** PM. Every task card lists what to do, what NOT to do, and the evidence required to call it done.

---

## 0. Global rules (apply to EVERY task — non-negotiable)

These are the hard-won lessons from this project. Breaking one of these has caused real incidents.

**✅ Always**
- **Match existing conventions.** Sockets use `socket.userId`/`socket.userRole`/`socket.userStateId` (not `.data`); routes emit via `req.app.get('io')` (no `req.io` middleware); the frontend uses `backendApi.get/post/patch` (no `apiRequest()` helper); the backend DB is `const { getAdminDb: getDb } = require('../lib/db')`.
- **Every DB change = a numbered migration AND a `schema.sql` update.** The CI drift guard fails if they diverge. Next free migration number is **016** (014/015 already exist).
- **Apply migrations via `supabase migration up`** so `supabase_migrations.schema_migrations` records them — never via raw `docker exec ... psql`.
- **External-API features degrade gracefully.** If a key is missing or the upstream is down, the feature no-ops silently — it must never break the page it lives on. (E1 already does this.)
- **Test the real path.** A feature is "done" only with real evidence: a real UI action + the real DB row/response. No mocked tests, no auth bypass, no `TEST_TOKEN` as proof.
- **Feature-branch → PR → CI green → merge.** One PR per feature (or tight group).

**⛔ Never**
- **Never run migrations blindly against production.** Prod is a *divergent* schema (more advanced state-scoped RLS than the codebase). Diff first; only apply the safe delta. See A1.
- **Never put real credentials in code, commands, scripts, or chat.** If a step needs auth, stop and ask the human.
- **Never bypass `stateScope`/auth to make a test pass** (and if you ever do temporarily, revert it and disclose it).
- **Never report "done" without the evidence.** "Should work" / "I summarized the diff" is not evidence.
- **Never leave throwaway scripts** (`test_*.js`, `check_*.js`, scratch SQL) in the repo. `git status` must be clean of them.

---

## 1. Recommended order (value ÷ risk, demo-first)

1. **E1 — AI Photo Classifier** → *already implemented; just verify + commit.*
2. **A2 — ML CORS fix** (5 min, closes a real hole).
3. **A3 — Alert delivery logs in admin** (pure frontend on existing data).
4. **E10 — Event heatmap** (1 day, biggest visual-per-effort; dep already present).
5. **B1 — Ingestion health dashboard** (lifts the 4/10 observability score).
6. **C2 — Calibrated severity** (makes ML scores defensible to a mentor).
7. **A1 — Prod schema reconciliation** (do carefully, off the demo critical path).
8. Everything else → **defer** (see §4).

---

## 2. Task cards (do these)

### E1 — AI Incident Photo Classifier ✅ *implemented, needs verification*
**Goal:** citizen photo → ML suggests damage type + severity → shown in coordinator queue.
**Already built:** `015_incident_ai_classification.sql` + `schema.sql` (`ai_classification JSONB`); `ml-service/app/services/vision_service.py` (HF Inference API, graceful); `POST /classify/image`; `incidents.js` background hook; `ReportsQueue.jsx` badge + approve pre-fill.
- ✅ **Do:** add `HF_API_TOKEN` (free) to `ml-service/.env`; restart ML + backend; submit a report **with a photo**; confirm `incident_reports.ai_classification` populates and the badge shows; confirm submission still works with the token **absent** (badge just doesn't appear).
- ⛔ **Don't:** add local `torch`/`transformers` to `requirements.txt` (heavy, slow) — the HF API path needs no new deps. Don't block the incident response on the classification (it's intentionally post-response/fire-and-forget — keep it that way). Don't claim a confidence number means trained-model accuracy — `resnet-50` is generic; label it "AI suggestion."
- **Evidence:** screenshot of the badge on a real report + the `ai_classification` JSON from the DB; and a submit with no token still returning 201.
- **Effort:** done; ~30 min to verify.

### A2 — Fix ML service CORS
**Goal:** stop `ml-service/app/main.py` accepting `allow_origins=["*"]`.
- ✅ **Do:** read `ALLOWED_ORIGINS` from env (same pattern as backend), default to `http://localhost:5173`; restart and confirm the frontend's prediction calls still work.
- ⛔ **Don't:** keep `allow_credentials=True` together with `["*"]` (invalid + insecure). Don't hardcode a prod domain — use env.
- **Evidence:** the diff + a successful frontend → ML call from an allowed origin, and a blocked one from a disallowed origin.
- **Effort:** 5 min.

### A3 — Surface alert delivery logs (admin/coordinator)
**Goal:** show the `alert_logs` already returned by `GET /api/alerts/:id`.
- ✅ **Do:** render a delivery panel per alert — total/delivered/failed, per-channel table, failed-with-error rows, a green/amber/red badge. Pure frontend.
- ⛔ **Don't:** add a new endpoint or table — the data and API already exist. Don't expose recipient PII beyond what the coordinator already sees.
- **Evidence:** screenshot of the panel for a real alert that had a mix of delivered/failed.
- **Effort:** ~3 hrs.

### E10 — Event clustering heatmap *(the only other E worth doing)*
**Goal:** toggleable kernel-density heat layer over the map.
- ✅ **Do:** use `leaflet.heat` (already a dependency — import it, don't add a CDN `<script>` if the npm package is present); build points from `events` with severity weights; add a toggle in the map controls; clean up the layer on unmount.
- ⛔ **Don't:** leave the heat layer and markers both fully on at once if it's visually noisy — make it a toggle. Don't recompute on every render — gate on `showHeat`.
- **Evidence:** screenshot heat layer on/off; confirm no console errors and the layer is removed on toggle-off.
- **Effort:** ~1 day.

### B1 — Ingestion health dashboard
**Goal:** per-source last-fetch time, count, status (USGS/NCS/FIRMS/GDACS/EONET/IMD/CWC).
- ✅ **Do:** in `apiPollers.js`, write `ingestion:meta:<source>` to Redis after each poll (success + error); add admin-guarded `GET /api/admin/ingestion-health`; poll it every 60s in the admin UI with TanStack Query.
- ⛔ **Don't:** add a new DB table (use Redis, already configured). Don't expose it on a non-admin route. Don't fail the cron tick if the meta-write fails (wrap in try/catch).
- **Evidence:** the endpoint JSON + a screenshot of the status grid showing real timestamps; kill one source's network and confirm it flips to red.
- **Effort:** ~4 hrs.

### C2 — Calibrated, explainable severity
**Goal:** replace hardcoded severity constants with a documented weighted formula (BIS zone × population density × time-of-day).
- ✅ **Do:** add `state_population_density.json` (Census 2011, public); implement a documented formula; return a `score_explanation` string in the response; keep the old behavior as a fallback if inputs are missing.
- ⛔ **Don't:** claim it's "trained ML" — it's *explainable rules*, and that's the honest framing. Don't break the existing `/classify/severity` response shape (additive only).
- **Evidence:** before/after scores for 2–3 events + the explanation string; ML `/classify/severity` still returns its existing fields.
- **Effort:** ~1 day.

---

## 3. A1 — Production schema reconciliation (special handling, off the demo path)

**Goal:** make the codebase canonical for prod's *more advanced* state-scoped RLS, then apply only the safe delta to prod. (Full procedure in `DEPLOY_CHECKLIST.md` / `TECHNICAL_REFERENCE.md` §16.)
- ✅ **Do:** rehearse on a restore of `prod_backup.sql` first; capture prod's `coordinator_state_id()` + per-state policies + `assign_report_state()` into a migration; verify a fresh schema matches via the drift guard; apply only the genuinely-missing-and-safe pieces to prod via `migration up` after a fresh backup.
- ⛔ **Don't:** run the blanket `migration repair 001..009` + `db push` plan — it would **downgrade prod's security** (drop state-scoped policies + the auto-assign trigger). Don't enable Supabase auto-deploy until this is done and verified. Don't do this the day of the demo.
- **Evidence:** clean drift-guard run + a rehearsal on the backup proving signup + RLS still work, then a verified prod apply.
- **Effort:** ~1 day, deliberate.

---

## 4. Skip / defer (and why)

| Feature | Decision | Reason |
|---|---|---|
| D4 — WhatsApp inbound bot | **Skip** | You said skip WhatsApp; costs at scale; webhook + geocoding key overhead |
| E9 — WhatsApp status updates | **Skip** | Same WhatsApp dependency |
| E2 — Volunteer module | Defer | 4 days, large surface, not demo-critical |
| E3 — Compliance scoring | Defer | 4 days; nice for a paper, not the demo |
| E4 — Impact estimator | Defer | 3 days; needs population raster/JSON; medium payoff |
| E5 — Responder GPS | Defer | depends on B2 (responder view) existing first |
| E6 — Cross-state cascade | Defer | 2 days; subtle PostGIS; low visible payoff |
| E7 — Offline queuing | Defer | 2 days; SW background-sync is fiddly to demo reliably |
| E8 — Satellite linking | Defer | needs Bhuvan/Copernicus account; deep-link is shallow value |
| C1 — Proxy confidence | Defer | research-paper feature, not demo |
| C3 — Compound hazard | Defer | genuinely novel but 2 days; revisit after demo |
| D1/D2/D3 | Defer | feedback loop / replay / pre-positioning — post-demo polish |
| B2 — Responder view | Optional | enables E5; do only if responder role is in scope |
| B3 — Frontend tests | Ongoing | already partial; expand under the existing test ticket, not as a "feature" |

---

## 5. Definition of done (every feature)
1. Migration (if any) applied via `supabase migration up`; `schema.sql` updated; **drift guard green**.
2. Conventions matched; no throwaway files; graceful degradation for external deps.
3. Real-path evidence captured (UI action + DB/response), not mocked.
4. One PR, CI green, merged.

*Companion docs: `civicshield-feature-implementation-guide.md` (the source spec), `FEATURES.md`, `TECHNICAL_REFERENCE.md`, `DEPLOY_CHECKLIST.md`, `PROJECT_SCORECARD.md`.*
