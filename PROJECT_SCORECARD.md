# CivicShield AI — Project Scorecard

Re-rate at the end of each phase and watch the numbers move. Scores are 0–10, brutal.

## Scores

| Standard | Baseline (post-review) | Current | Target (prod) | Notes |
|---|---|---|---|---|
| Architecture & design | 7.0 | 7.0 | 8 | Solid 3-service split; cron still monolithic |
| Database design | 6.5 | 7.0 | 8 | +consolidated `schema.sql`, +`alerted_at`, +`resources.state_id` gap fix |
| Code quality | 6.5 | 7.0 | 8 | +Zod on resources PATCH, +XSS escaping, +RPC caching |
| Security | 6.5 | 7.0 | 9 | +HTML escaping in alerts, +email subject CRLF strip; RLS audit still pending |
| Reliability | 6.0 | 6.5 | 8 | +deterministic auto-alert flag; single DB / no circuit breakers |
| AI/ML genuineness | 5.0 | 5.0 | 8 | Unchanged — needs validation/metrics |
| Frontend/UX | 6.0 | 6.0 | 8 | +env var standardized; still untested |
| Observability/ops | 4.0 | 4.0 | 8 | Unchanged — dashboards/runbooks pending |
| Testing/QA | 3.0 | 4.5 | 8 | +CI pipeline (lint/test/build/secret-scan); real test coverage still thin |
| Deploy readiness | 3.5 | 4.5 | 9 | +consolidated schema + CI; fresh-rebuild still unproven, on `deployment` branch |
| Documentation | 7.0 | 7.5 | 9 | +scorecard, +workplan, +project doc |
| Engineering process | 4.0 | 5.0 | 8 | CI enforces evidence; culture still maturing |
| **Overall** | **5.5** | **6.0** | **8.3** | Moving in the right direction |

## Changelog of improvements

### Session 2 (hardening batch)
- **Security:** HTML-escape alert `title`/`body`/`severity` in email + Telegram (XSS); strip CRLF from email subject (header injection).
- **Validation:** `resources PATCH` now uses a strict partial Zod schema (no blind `req.body` spread); `{lat,lon}` → PostGIS WKT.
- **Reliability:** auto-alert is now deterministic via `events.alerted_at` (migration 007) instead of the `updated_at − created_at < 1s` heuristic; alert records now carry `event_id` + `state_id`.
- **Performance:** ingestion caches `get_state_from_point` by rounded coords (fewer RPC round-trips).
- **Schema gap fix:** added `resources.state_id` (used by code, never created before).
- **Reproducibility:** new `supabase/schema.sql` — single authoritative fresh-DB schema (squashed 001→007).
- **CI:** `.github/workflows/ci.yml` — backend lint+test, frontend lint+test+build, ML import smoke, secret scan, on every PR to `main`/`deployment`.
- **Config:** standardized frontend env var to `VITE_BACKEND_URL`.

## Still open (highest priority first)
1. Prove fresh-DB apply (`schema.sql` on a clean Supabase project) — Phase 0.1.
2. Real backend integration + frontend tests wired into CI.
3. RLS audit against the access matrix.
4. Observability: ingestion + alert-delivery dashboards.
5. Geofenced alerting via `alerts.target_zone` + subscription preferences.
6. ML model validation / published accuracy.
7. Merge `deployment` → `main`; backups + DR runbook.

*Update this file at each phase boundary.*
