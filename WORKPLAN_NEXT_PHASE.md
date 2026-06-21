# CivicShield AI — Next-Phase Workplan

**Author:** Project Manager
**Date:** 2026-06-21
**Status of project:** Round-3 review fixes verified; code is being pushed. Core platform works against the live Supabase instance. This plan takes us from "works on our one cloud DB" to "production-grade, reproducible, and feature-complete."

---

## Guiding objectives for this phase

1. **Make it reproducible.** Anyone should be able to stand up a fresh environment from the repo with zero manual surgery.
2. **Make it trustworthy.** Real automated tests + CI so "done" is provable, not asserted.
3. **Make it production-safe.** Security hardening, observability, and reliability before real users depend on it.
4. **Make it smarter and broader.** Upgrade the "AI" from rules to measurable models where it matters, expand coverage, and tighten alert targeting.

Everything below is sequenced so each phase unblocks the next. Don't start Phase 2 feature work until Phase 0 closes.

---

## Phase 0 — Close out & stabilize (THIS WEEK)

Goal: finish the current round cleanly and remove the one unverified risk we knowingly accepted.

| # | Task | Why | Acceptance criteria | Effort |
|---|------|-----|---------------------|--------|
| 0.1 | Prove clean migration rebuild | We're shipping migrations never rebuilt from scratch; the `005` fix is unexercised | Run `001→006` on a fresh **free Supabase cloud project** (no Docker needed); paste a zero-error log; `SELECT count(*) FROM states;`=36; `get_state_from_point(28.61,77.20)`=Delhi | S |
| 0.2 | Squash migrations into one authoritative schema | 6 overlapping/idempotent migrations are fragile and confusing | A single `schema.sql` (or clean numbered set) that applies cleanly on a fresh DB and matches the code; old patches archived | M |
| 0.3 | Secrets & push hygiene | A leaked `SUPABASE_SERVICE_KEY` is catastrophic | `git grep` for key patterns is clean; `.env` never tracked; rotate any key that ever touched a commit | S |
| 0.4 | Standardize env var names | Frontend uses `VITE_API_URL`; docs say `VITE_BACKEND_URL` | One canonical name everywhere; `.env.example` matches code 1:1 | S |
| 0.5 | Stand up CI (GitHub Actions) | Stop relying on manual, mockable "proofs" | On every PR: install, lint, run backend Jest + frontend Vitest, build frontend; red CI blocks merge | M |

**Exit criteria for Phase 0:** fresh-rebuild log exists, CI is green on `main`, no secrets in history.

---

## Phase 1 — Production hardening (2–3 WEEKS)

Goal: make the platform safe and observable enough for real users.

### 1A. Security
- **Rate-limit tiering** — separate limits for auth, write, and read endpoints (current global limiter is coarse).
- **Input hardening** — apply Zod validation to every write route (some still trust `req.body`, e.g. `resources PATCH`), and sanitize free-text that ends up in emails/HTML (alert templates interpolate user text directly).
- **RLS audit** — verify every table's policies against the actual access matrix; confirm service-role is the only path that bypasses, and that anon truly can't read sensitive rows.
- **Socket authorization depth** — now that handshake JWT works, actually *scope* sensitive broadcasts to `state:`/`role:` rooms instead of `public` where appropriate.
- **Secrets management** — move from `.env` files to the host's secret store; document key rotation.

### 1B. Reliability
- **Migration drift guard** — a CI step (or `supabase db diff`) that fails if code references a column/table the schema doesn't have. This is the exact class of bug that bit us twice.
- **Idempotent/robust ingestion** — replace the fragile auto-alert "`updated_at − created_at < 1s`" heuristic with an explicit `alerted_at`/flag column so re-alerting is deterministic.
- **Batch the per-event `get_state_from_point` RPC** — current ingestion calls it once per event in a loop; batch or do it set-based in SQL for large polls.
- **Graceful degradation review** — confirm every external fetch failure degrades cleanly (most do; verify FIRMS/GDACS/Open-Meteo timeouts don't wedge a cron tick).

### 1C. Observability
- **Sentry coverage** — confirm backend + frontend + ML all report; add release tagging.
- **Structured logging + health depth** — `/health` should also report cron last-run timestamps and queue/lag; add a `/metrics` endpoint or log shipping.
- **Alert delivery dashboards** — surface `alert_logs` success/failure rates per channel (we store the data; nothing reads it yet).

**Exit criteria for Phase 1:** documented threat model addressed, drift guard in CI, dashboards for ingestion + alert delivery, all three services reporting to Sentry.

---

## Phase 2 — Test & quality depth (parallel with late Phase 1)

Goal: real confidence, not mocked confidence.

- **Backend integration tests** against an ephemeral test DB (the existing `tests/integration` proofs become real CI tests, not manual scripts). Cover: auth gates (allow + deny), incident lifecycle, alert dispatch + logging, predictions with mocked upstreams.
- **Frontend tests** — the React app was never fully audited. Add Vitest + Testing Library coverage for `useAuth`, `useDisasterEvents`, `ProtectedRoute`, and each page's critical path; add a Playwright smoke test for login→portal→submit report.
- **ML tests** — unit-test prophet fallback, OR-Tools allocation (no double-assign), and the rule classifiers' boundaries.
- **Load test** — simulate realtime fan-out (Socket.io + Supabase Realtime) at target concurrency; find the ceiling before users do.

**Exit criteria:** >70% meaningful coverage on backend routes and core frontend hooks; one end-to-end Playwright run in CI.

---

## Phase 3 — Product & intelligence depth (3–5 WEEKS)

Goal: raise the ceiling on what the platform actually delivers.

### 3A. Smarter AI (the biggest credibility lever)
- **Replace rule-based severity/misinformation with measurable models** *or* formally validate the rules with a labeled test set and publish accuracy. Today they're heuristics presented honestly — the next step is evidence they work.
- **Forecast validation** — backtest Prophet forecasts against historical events; report MAE/skill vs. a naive baseline so "risk level" means something.
- **Wire optimization into the UI** — OR-Tools routing/allocation exists in the ML service but isn't surfaced; build a coordinator "dispatch planner" view.

### 3B. Alert targeting (high user value, schema already supports it)
- **Geofenced alerts** — `alerts.target_zone` (POLYGON) exists but is unused. Implement "alert everyone whose location/subscription falls in this zone" instead of broadcasting to default env recipients.
- **Subscription preferences** — let citizens choose channels, languages, and regions of interest.

### 3C. Coverage & localization
- **More India sources** — pursue official IMD/NDMA access if/when APIs open; add air-quality (already keyed) and additional river gauges.
- **Multilingual delivery** — the translation path exists (hi/ta/te/bn/gu/mr/pa); validate quality and surface language choice in the UI.
- **Accessibility & mobile** — the PWA is installable; audit a11y (WCAG) and mobile map performance.

**Exit criteria:** at least one validated model with published metrics, geofenced alerting live, citizen subscription preferences shipped.

---

## Phase 4 — Scale & operations (ongoing)

- **Deployment pipeline** — automated deploy of backend + ML + frontend on merge to `main`; environment promotion (staging → prod).
- **Disaster recovery** — automated DB backups, a documented restore runbook, and (now that 0.1/0.2 are done) a proven rebuild-from-migrations path.
- **Cost & uptime** — revisit the disabled Render keep-alive; choose a hosting tier that matches 24/7 cron needs; monitor cost.
- **Runbooks** — on-call doc for "cron stopped," "ML down," "alert channel failing," "DB at capacity."

---

## Prioritized backlog (do-next order)

1. **0.1 fresh-rebuild proof** + **0.3 secrets check** (gating, do immediately)
2. **0.5 CI** + **1B migration drift guard** (stops regressions)
3. **0.2 schema squash**
4. **1A security pass** (Zod-everywhere, RLS audit, output sanitization)
5. **2 backend + frontend integration tests**
6. **1C observability + alert dashboards**
7. **3B geofenced alerts + subscriptions** (highest user-visible value)
8. **3A model validation** (highest credibility value)
9. **4 deploy pipeline + DR**

---

## Risks to watch

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migrations never rebuilt from scratch | New env / DR fails silently | Phase 0.1 + 1B drift guard |
| "AI" is rules presented as models | Credibility / trust | Phase 3A validation or model upgrade |
| Frontend largely untested | Regressions reach users | Phase 2 frontend tests |
| Single cloud DB as source of truth | No safe DR today | Phase 0.1/0.2 + Phase 4 backups |
| Default-recipient alerting | Alerts don't reach affected people | Phase 3B geofencing + subscriptions |
| Mockable "proofs" culture | Done ≠ working | CI with real test DB (Phase 0.5 / 2) |

---

## Definition of "production ready" (the bar we're working toward)

- A new engineer can clone, configure `.env`, apply migrations, and run all three services with no manual DB surgery.
- CI is green and blocks merges; real integration + frontend tests exist.
- Every write path is validated and authorized; RLS verified; no secrets in history.
- All three services report errors + key metrics; alert delivery is observable.
- Forecasts/classifiers have published accuracy or are clearly labeled.
- Backups + a tested restore/rebuild runbook exist.

---

## Suggested cadence

- **Weekly:** review the backlog top-to-bottom, require evidence for anything marked done (see the engineer-prompt templates), update this plan's status column.
- **Per phase:** a short go/no-go against the exit criteria before starting the next phase.

*Update this document as phases close. Phase 0 is the gate to everything else — don't let feature work jump the queue.*
