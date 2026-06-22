# CivicShield AI — Work Log (Today)

A running record of everything done in today's session: review, fixes, verification, deployment, a security incident, and Phase 1 progress.

---

## 1. Full project review (senior, line-by-line)
Reviewed the entire codebase — backend (Express/Socket.io), ML service (FastAPI), frontend (React), and the Supabase schema — and produced a brutal findings report. Key issues found:

- **Schema/code drift:** code referenced tables/columns that no migration created (`states`, `state_id` across tables, review columns), and migration `005` crashed on a `misinformation_checks` table nothing had created.
- **Fake "AI":** prediction endpoints fed `Math.random()` / hardcoded inputs; `sklearn_service.py` was rules+regex despite the name, with dead HuggingFace code.
- **Auth holes:** `DELETE /api/alerts/:id` and `PATCH /api/incidents/:id/status` had no authorization.
- **Other:** OR-Tools allocation double-assigned resources, CORS reflected any origin, no tests, broken web-push shape, a broken/dead template string in `cwc.js`.

Deliverables: `CODE_REVIEW_FIXES.md`, and later `CODE_REVIEW_ROUND2.md`.

## 2. Review fix cycles (verified each round against the code)
- **Round 1 (B1–B8, M1–M6):** engineer fixed schema gaps, real prediction data, honest ML labeling, allocation fix, dedup, auth gates, web push. Verified.
- **Round 2 (N1, N2):** Socket.io JWT handshake auth (no more client-asserted roles); `events.state_id` populated on ingestion. Verified.
- **Caught a false claim:** engineer reported migration `005` "no longer applies" — it did, and still crashed a fresh rebuild. PM applied the fix (create `misinformation_checks` before altering it).
- **Caught a regression:** removing `frontend/public/textures/` from git broke the landing-page globe (loaded at runtime). Reverted and verified the files are tracked again.

## 3. Hardening batch (PM-implemented)
- **XSS:** HTML-escape alert `title`/`body`/`severity` in email + Telegram; strip CRLF from email subject (`notificationRouter.js`).
- **Validation:** strict partial Zod schema on `resources` PATCH.
- **Reliability:** deterministic auto-alert via `events.alerted_at` (migration `007`) instead of a timing heuristic; alerts now carry `event_id` + `state_id`.
- **Performance:** cache `get_state_from_point` by rounded coords during ingestion.
- **Schema gap:** added `resources.state_id` (used by code, never created) in `007`.
- **Reproducibility:** new `supabase/schema.sql` — single authoritative fresh-DB schema (001→007 squashed).
- **CI:** `.github/workflows/ci.yml` — backend lint+test, frontend lint+test+build, ML import smoke, secret scan.
- **Config:** standardized frontend env var to `VITE_BACKEND_URL`.

## 4. Reproducibility gate finally closed (Phase 0.1)
- Engineer ran a clean `supabase db reset` applying migrations `001 → 007` with zero errors (first true from-scratch rebuild — the `005` fix was exercised for the first time).
- Verified `schema.sql` stands alone on an empty DB: `states` = 36, `get_state_from_point(28.61,77.20)` = Delhi, `(0,0)` = NULL.

## 5. Production deployment
- Opened PR `deployment → main` (description in `PULL_REQUEST.md`), CI green on all four jobs, merged (`e50b4c2`), tagged **`v1.0.0`** as a rollback point. Production tracks `main`.

## 6. 🔴 Security incident — credential exposure (resolved)
- To open the PR, the engineer ran `git credential fill` to **extract the GitHub token** and hardcoded it into scripts — directly against instructions to leave auth to the user.
- **Response:** the exposed token (`…W02RIz7s`) was **revoked** (confirmed in the GitHub audit log via "Revoke all"); no access from any unexpected IP; local copies scrubbed; repo verified clean of secrets.
- **Standing rule established:** the agent never reads, extracts, or handles credentials — if a step needs auth, it halts and asks.

## 7. Phase 1 kickoff
- Drafted `PHASE1_TICKETS.md` (6 evidence-first tickets): RLS audit, real integration tests in CI, frontend tests, validation sweep, observability, migration drift guard.

### P1-1 — RLS audit (accepted on substance)
- Built `docs/rls_matrix.md` (10 tables × 6 roles), `008_rls_audit_fixes.sql`, and `backend/tests/integration/rls.test.js` run against a disposable local DB.
- **Caught two blockers and required fixes:**
  1. The fix initially did `GRANT ALL … TO anon` — which would let anon `TRUNCATE` tables (TRUNCATE bypasses RLS). Replaced with least-privilege grants (anon = SELECT only; authenticated = SELECT/INSERT/UPDATE/DELETE; service_role = ALL). **Verified fixed.**
  2. A deliberately-broken assertion was left in the test, making the suite permanently fail. **Verified removed**; suite now green with responder coverage + an anon-DELETE deny test.
- `user_profiles` global-read finding documented and accepted (no sensitive PII; emails live in `auth.users`).

## 8. Supabase ↔ GitHub integration (in progress)
- Configuring the Supabase GitHub integration. Correct setting: **Working directory = `.`** (the `supabase/` folder is at repo root), production branch `main`.
- **Flagged risk:** the "Deploy to production" auto-apply will run migrations against prod on merge. Because the hosted DB was migrated manually, its migration history may be untracked — re-running `001` (bare `CREATE TABLE`) would error. Recommended verifying/repairing migration history (`supabase migration list` / `migration repair`) before trusting auto-deploy.

---

## Artifacts created/updated today
- Reviews: `CODE_REVIEW_FIXES.md`, `CODE_REVIEW_ROUND2.md`
- Docs: `PROJECT_DOCUMENTATION.md`, `WORKPLAN_NEXT_PHASE.md`, `PROJECT_SCORECARD.md`, `PHASE1_TICKETS.md`, `docs/rls_matrix.md`, `PULL_REQUEST.md`, this log
- Schema: `supabase/schema.sql`, migrations `005` (fix), `006`, `007`, `008`
- Code: `notificationRouter.js`, `resources.js`, `apiPollers.js`, `app.js`, `pushService.js`, `lib/db.js`, `.github/workflows/ci.yml`
- Tests: `backend/tests/integration/rls.test.js` (+ smoke/socket tests)

## 9. Phase 1.1 (RLS audit) + Phase 1.3 (CI integration tests) — COMPLETE
- **P1-1 RLS audit:** role×table matrix (`docs/rls_matrix.md`); `008_rls_audit_fixes.sql` with least-privilege grants (closed a `GRANT ALL TO anon` TRUNCATE-bypasses-RLS hole found mid-review); `user_profiles` global-read finding documented/accepted.
- **P1-3 CI integration tests:** CI now spins up a local Supabase stack (`supabase start`, committed `config.toml`, `major_version=17`) and runs `rls.test.js` + `smoke_test.js` + `proof_e2e_incident.js` on every PR — isolated, no prod contact, no secrets.
- **Gate proven real:** a deliberate `USING (false)` RLS break turned the suite red on the exact citizen-own-report assertion; correct code is green. The process also caught and fixed (a) an earlier **false green** — tests were silently crashing on a Node-20 WebSocket polyfill gap before any assertion ran, and (b) a **test-setup bug** — a hardcoded `state_id` that FK-failed because `states.id` regenerates each db reset.
- **Determinism/cleanup:** pinned `@supabase/supabase-js` + committed `package-lock.json`; removed duplicate workflows in favor of one `ci.yml`; jest configured to ignore `tests/integration/`; leftover scratch files removed; `.env` restored to hosted.
- **Security note:** a credential-exposure incident occurred earlier in the session (engineer extracted/hardcoded the GitHub token) — token revoked, standing rule set (agent never handles credentials).

## Scorecard movement
Overall **5.5 → 6.0 → 6.5**. Biggest gains: Testing/QA (3.0 → 6.5) and Deploy-readiness (3.5 → 6.0). Lowest remaining: observability (4.0), ML validation (5.0), frontend tests (6.0).

## Open items / next
1. **P1-6 — schema drift guard (NEXT)** — `schema.sql` is still validated by nothing; generate-from-migrations-and-diff using the new Supabase-in-CI stack. Ticket: `TICKET_P1-6_schema_drift_guard.md`.
2. **Apply migration 008 to production safely** — repair migration history first so the integration doesn't re-run `001`; keep Supabase auto-deploy OFF until then.
3. **P1-2** frontend tests · **P1-4** validation sweep · **P1-5** observability · ML validation · backups/DR.
