# PR: `deployment` → `main` — Hardening, schema reproducibility, CI & review fixes

## Summary
This PR brings `main` up to date with the full review-and-hardening cycle on `deployment`. It closes a series of correctness, security, and reproducibility issues found in a line-by-line senior review, adds a CI safety net, and — for the first time — proves the database can be rebuilt cleanly from the repo.

Net effect: the platform goes from "works on one hand-migrated cloud DB" to "reproducible, validated, and guarded against regressions."

## What changed

### Database schema & reproducibility
- **`005_schema_patch.sql`** — creates `misinformation_checks` before any `ALTER`/RLS touches it (previously aborted a fresh migration chain).
- **`006_consolidated_clean.sql`** — `states` table + 36 seeded states/UTs, `get_state_from_point()`, `state_id` across `user_profiles`/`events`/`alerts`/`incident_reports`, canonical incident status set, unified signup trigger, full RLS pass.
- **`007_event_alerted_flag.sql`** — adds `events.alerted_at` (deterministic auto-alerting) and `resources.state_id` (gap: used by code, never created).
- **`001_initial_schema.sql`** — adds `CREATE EXTENSION IF NOT EXISTS postgis` so a fresh `db reset` doesn't abort before the first geography column.
- **`supabase/schema.sql`** — NEW. Single authoritative, idempotent fresh-DB schema (squashed 001→007) for reproducible environments.

### Backend hardening
- **XSS:** alert `title`/`body`/`severity` are HTML-escaped in email + Telegram (HTML mode); email subject CRLF-stripped (`notificationRouter.js`).
- **Validation:** `resources` PATCH uses a strict partial Zod schema instead of spreading `req.body` (`resources.js`).
- **Reliability:** auto-alerting is deterministic via `events.alerted_at` instead of a timing heuristic; alerts now carry `event_id` + `state_id` (`apiPollers.js`).
- **Performance:** `get_state_from_point` cached by rounded coords during ingestion (`apiPollers.js`).
- **Auth (N1):** Socket.io handshake verifies the Supabase JWT; room membership is server-derived, not client-asserted (`app.js`).
- **Geo (N2):** `events.state_id` resolved + populated on ingestion.

### Frontend
- Standardized push subscription endpoint to `VITE_BACKEND_URL` (`pushService.js`).

### CI / tooling
- **`.github/workflows/ci.yml`** — backend lint+test, frontend lint+test+build, ML import smoke, and a secret scan on every PR to `main`/`deployment`.
- Removed throwaway debug scripts.

## Testing & evidence
- **Clean migration apply:** `supabase db reset` applied 001→007 with zero errors (first time the chain rebuilds from scratch).
- **Standalone schema:** `schema.sql` applied to an empty DB → `SELECT count(*) FROM states` = 36; `get_state_from_point(28.61,77.20)` = Delhi UUID; `get_state_from_point(0,0)` = NULL.
- **N1:** forged-role socket client joins only `public` (role spoof rejected).
- **N2 / smoke:** citizen submit → coordinator approve/reject end-to-end against a real local DB; deny-path returns 403.
- **CI:** all four jobs green on head commit (`0f1c4f2`).

## Review arc closed by this PR
- **B1–B8** schema/code drift, fake-data predictions, auth holes, broken web push.
- **M1–M6** real prediction data, honest ML labeling, OR-Tools allocation fix, dedup, tests/CI.
- **N1–N2** socket auth, event state scoping.
- **005/007** migration fixes; **006/schema.sql** consolidation.

## Known follow-ups (tracked in `WORKPLAN_NEXT_PHASE.md` / `PROJECT_SCORECARD.md`)
- RLS audit against the access matrix.
- Observability: ingestion freshness + alert-delivery dashboards.
- Real backend integration + frontend test coverage (beyond smoke).
- ML model validation / published accuracy.
- Geofenced alerting (`alerts.target_zone`) + citizen subscription preferences.
- Move large binaries (textures) to LFS/CDN.

## Reviewer notes
- The clean-rebuild reproducibility gate (Phase 0.1) is now satisfied.
- CI-green confirmed via the GitHub Actions run for the head commit (all four jobs `success`).
- No secrets in tracked files (the `eyJ…` example value is the public Supabase local-dev demo key).

## Merge checklist
- [x] Migrations apply cleanly on a fresh DB (001→007)
- [x] `schema.sql` stands alone (36 states, geo resolver verified)
- [x] CI green on head commit (4/4 jobs)
- [x] No secrets in tracked files
- [x] Debug/scratch scripts removed
- [ ] Squash-or-merge decision recorded
- [ ] Tag a release after merge
