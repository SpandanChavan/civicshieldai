# CivicShield AI — Project Scorecard

Re-rate at the end of each phase and watch the numbers move. Scores are 0–10, brutal.

## Scores

| Standard | Baseline (post-review) | Prev | Current | Target (prod) | Notes |
|---|---|---|---|---|---|
| Architecture & design | 7.0 | 7.0 | 7.0 | 8 | Solid 3-service split; cron still monolithic |
| Database design | 6.5 | 7.0 | 7.5 | 8 | Reproducible schema proven; grants fixed; RLS verified end-to-end |
| Code quality | 6.5 | 7.0 | 7.0 | 8 | Stable; deterministic deps pinned |
| Security | 6.5 | 7.0 | 7.5 | 9 | RLS audited + automated tests; least-privilege grants; TRUNCATE hole closed. Output-sanitization sweep (P1-4) still open |
| Reliability | 6.0 | 6.5 | 7.0 | 8 | Deterministic deps + a real CI gate; single DB / no DR still |
| AI/ML genuineness | 5.0 | 5.0 | 5.0 | 8 | Unchanged — still needs validation/metrics |
| Frontend/UX | 6.0 | 6.0 | 6.0 | 8 | Unchanged — still no real tests (P1-2 next) |
| Observability/ops | 4.0 | 4.0 | 4.0 | 8 | Unchanged — dashboards/runbooks pending (P1-5) |
| Testing/QA | 3.0 | 4.5 | 6.5 | 8 | **Real integration tests now gate every PR** against a live Supabase stack; proven to fail on real regressions. Frontend tests + unit depth still thin |
| Deploy readiness | 3.5 | 4.5 | 6.0 | 9 | Reproducible schema + green CI gate + committed config.toml. Single DB, auto-deploy intentionally off (history needs repair), no backups/DR |
| Documentation | 7.0 | 7.5 | 8.0 | 9 | +RLS matrix, worklog, phase tickets |
| Engineering process | 4.0 | 5.0 | 6.0 | 8 | CI gate now genuinely enforces (proven red on real breaks). Offset by a credential incident + repeated "done-but-not" claims this cycle |
| **Overall** | **5.5** | **6.0** | **6.5** | **8.3** | Real, earned progress this phase |

## Changelog of improvements

### Session 3 — Phase 1.1 (RLS audit) + Phase 1.3 (CI integration tests)
- **RLS audit (P1-1):** full role×table matrix (`docs/rls_matrix.md`); `008_rls_audit_fixes.sql` with **least-privilege grants** (anon=SELECT, authenticated=SELECT/INSERT/UPDATE/DELETE, service_role=ALL) — closed a critical `GRANT ALL TO anon` TRUNCATE-bypasses-RLS hole found mid-review. `user_profiles` global-read finding documented and accepted.
- **CI integration tests (P1-3):** CI now spins up a **local Supabase stack** (`supabase start`, committed `config.toml`, `major_version=17` to match prod) and runs `rls.test.js` + `smoke_test.js` + `proof_e2e_incident.js` against it on every PR — isolated, no production contact, no secrets.
- **Gate proven to mean something:** a deliberate RLS break (`USING (false)`) turned the suite **red on the exact citizen-own-report assertion**; correct code turns it green. Also exposed and fixed an earlier **false green** (tests were silently crashing on a Node-20 WebSocket polyfill gap before any assertion ran) and a **test setup bug** (hardcoded `state_id` FK failure).
- **Determinism:** pinned `@supabase/supabase-js` and committed `package-lock.json`; removed duplicate workflows (`backend-tests.yml`/`frontend-tests.yml`/`ml-tests.yml`) in favor of one `ci.yml`; jest configured to ignore `tests/integration/`.

### Session 2 — hardening batch
- XSS escaping in alert email/Telegram; CRLF-strip on subject.
- Zod on `resources` PATCH; deterministic auto-alert via `events.alerted_at` (migration 007); `get_state_from_point` caching; `resources.state_id` gap fix.
- Consolidated `supabase/schema.sql`; first CI pipeline; env var standardized to `VITE_BACKEND_URL`.

## Still open (highest priority first)
1. **P1-6 — schema drift guard** (next): `schema.sql` is still validated by nothing; generate-from-migrations-and-diff in the new CI stack.
2. **Apply migration 008 to production safely** — repair migration history first so the integration doesn't re-run `001`; keep auto-deploy OFF until then.
3. **P1-2 — frontend tests** (lowest-covered area alongside observability).
4. **P1-4 — output-sanitization & validation sweep** (Zod on every write route).
5. **P1-5 — observability** (ingestion freshness + alert-delivery dashboards; confirm Sentry across all three services).
6. **ML model validation / published accuracy.**
7. Backups + tested restore/DR runbook.

*Update this file at each phase boundary.*
