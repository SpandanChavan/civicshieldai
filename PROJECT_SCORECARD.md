# CivicShield AI — Project Scorecard

Re-rate at the end of each phase and watch the numbers move. Scores are 0–10, brutal.

## Scores

| Standard | Baseline | Prev | Current | Target | Notes |
|---|---|---|---|---|---|
| Architecture & design | 7.0 | 7.0 | 7.0 | 8 | Solid 3-service split; cron still monolithic |
| Database design | 6.5 | 7.5 | 8.0 | 8 | Schema drift now structurally guarded; real inconsistencies reconciled (009) |
| Code quality | 6.5 | 7.0 | 7.0 | 8 | Stable; deterministic deps pinned |
| Security | 6.5 | 7.5 | 7.5 | 9 | RLS audited + tested; over-permissive profiles policy removed. Output-sanitization sweep (P1-4) still open |
| Reliability | 6.0 | 7.0 | 7.5 | 8 | Two real CI gates now; single DB / no DR still |
| AI/ML genuineness | 5.0 | 5.0 | 5.0 | 8 | Unchanged — needs validation/metrics |
| Frontend/UX | 6.0 | 6.0 | 6.5 | 8 | Partial frontend test coverage |
| Observability/ops | 4.0 | 4.0 | 4.0 | 8 | Unchanged — dashboards/runbooks pending (P1-5) |
| Testing/QA | 3.0 | 6.5 | 7.0 | 8 | Real integration tests + schema-drift guard gate every PR. Frontend tests + unit depth still thin |
| Deploy readiness | 3.5 | 6.0 | 6.5 | 9 | Reproducible + drift-guarded schema, green CI gate. Single DB, auto-deploy off (history needs repair), no DR |
| Documentation | 7.0 | 8.0 | 8.0 | 9 | Comprehensive doc set maintained |
| Engineering process | 4.0 | 6.0 | 6.5 | 8 | Two enforcing CI gates proven (red on real breaks). Still offset by this cycle's credential incident + repeated "done-but-not" claims |
| **Overall** | **5.5** | **6.5** | **6.8** | **8.3** | Strong, earned phase-1 progress |

## Changelog of improvements

### Session 4 — Phase 1.6 (schema drift guard) COMPLETE
- CI now applies `migrations/` and `schema.sql` to separate DBs in the local Supabase stack, dumps both `public` schemas (PG17 tools via `docker exec`, `auth` stub, postgis in `extensions`, `\restrict` artifacts stripped, exact statement-level diff) and **fails on any drift**. Proven red on a deliberate divergence, green when 1:1.
- First run exposed **real pre-existing drift**, reconciled in `009_reconcile_schema_drift.sql`: fixed `incident_reports.status` default (`'pending'` violated the CHECK → `'pending_review'`), dropped 3 stale trigger functions, dropped 4 stale/over-permissive RLS policies (incl. `"Public profiles are viewable by everyone."`), aligned `audit_logs.id` default + `misinformation_checks` defaults + missing indexes.
- Maintenance note: `schema.sql` is hand-written, so it must be re-aligned whenever a migration changes the dump — the guard now enforces this.

### Session 3 — P1-1 (RLS audit) + P1-3 (CI integration tests)
- Role×table RLS matrix + least-privilege grants (closed a `GRANT ALL TO anon` TRUNCATE hole). Real integration tests (RLS/smoke/e2e) gate every PR against a local Supabase stack; gate proven to fail on a real RLS break and a real setup bug; exposed/fixed an earlier false-green (Node-20 WebSocket polyfill gap).

### Session 2 — hardening batch
- XSS escaping in alerts; Zod on resources PATCH; deterministic `alerted_at` auto-alert; RPC caching; `resources.state_id`; consolidated `schema.sql`; first CI pipeline; env var standardized.

## Still open (highest priority first)
1. **Apply migrations 008 + 009 to production safely** — both carry real prod fixes now. Repair migration history first so the integration doesn't re-run `001`; keep Supabase auto-deploy OFF until then. See `DEPLOY_CHECKLIST.md`.
2. **P1-2 — frontend tests** (lowest-covered area with observability).
3. **P1-4 — output-sanitization & validation sweep** (Zod on every write route).
4. **P1-5 — observability** (ingestion freshness + alert-delivery dashboards; Sentry across all three services).
5. **ML model validation / published accuracy.**
6. Backups + tested restore/DR runbook.

*Update this file at each phase boundary.*
