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

## Scorecard movement
Overall **5.5 → ~6.0** (and rising with P1-1). Lowest remaining: testing depth, observability, ML validation.

## Open items / next
1. **Don't enable Supabase auto-deploy** until migration history is verified/repaired on the hosted DB.
2. Finish P1-1 cleanup (remove leftover scratch files: `check_pol.js`, `check_pol2.js`, `test_pol.sql`, `backend/tests/integration/test_inc.js`; restore `backend/.env` to hosted).
3. **P1-3 next:** wire `rls.test.js` + smoke/incident tests into CI against a test DB; prove red-on-break.
4. Then P1-2 (frontend tests), P1-4 (validation sweep), P1-5 (observability), P1-6 (drift guard).
