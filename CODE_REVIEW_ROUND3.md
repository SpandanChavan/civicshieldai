# CivicShield AI — Code Review Round 3 (Manager Audit)

**Auditor:** PM (verified against live code, not against the engineer's own docs)
**Method:** Every "COMPLETE" / "NOT DONE" claim in `PROJECT_SCORECARD.md` and `WORKLOG_TODAY.md` was re-checked against the actual files — CI workflow, migrations, routes, tests, ML service — with file:line citations. Nothing here is taken on the engineer's word.

## Verdict on prior claims

| Claim | Verdict |
|---|---|
| P1-1 RLS audit — COMPLETE | **Overstated.** Matrix marks all 60 cells "Yes" with no real evidence trail; admin role never tested; `008_rls_audit_fixes.sql` grants `SELECT ON ALL TABLES TO anon` — including `audit_logs`, `incident_reports`, `alert_logs`, `misinformation_checks`, `push_subscriptions` — which contradicts the "least privilege" framing. Safety depends entirely on RLS policies stacked on top of an over-broad grant. |
| P1-3 CI integration tests — COMPLETE | Confirmed true. Real Supabase stack in CI, real test runs, secret-scan job. |
| P1-6 schema drift guard — COMPLETE | Confirmed true, **but** it's sitting on an unmerged branch (`feature/p1-6-schema-drift`) with 110 modified files uncommitted/unmerged to `main`. "Complete" is not the same as "shipped." |
| P1-2 frontend tests — NOT DONE | **Wrong — scorecard is stale.** 3 real test files exist (`AlertCard`, `MisinformationPanel`, `ProtectedRoute`) with genuine assertions. Coverage is still thin against the original ticket scope (no `useAuth`, no `useDisasterEvents`, no Playwright e2e). |
| Auth gates on alerts DELETE / incidents PATCH — fixed | Confirmed for those two routes only. **Same vulnerability class left wide open elsewhere**: `PATCH /api/events/:id/deactivate` and `DELETE /api/resources/:id` have zero auth checks. |
| ML "fake AI" — fixed/relabeled honestly | **Not fully true.** `sklearn_service.py` is honestly self-documented as rule-based now, but `ml-service/app/routers/classify.py` still has docstrings claiming "ML model" / "HuggingFace API" that flatly contradict the service it calls. |
| CORS, secrets hygiene, package-lock, render.yaml | Confirmed true / clean. |

## Findings, ranked

### P0 — Security holes, fix before anything else
1. **`PATCH /api/events/:id/deactivate` has no auth/role check** (`backend/src/routes/events.js:139`). Relies on `stateScope` middleware, which its own code comment (`backend/src/middleware/stateScope.js:18`) calls "soft-auth... not a gate." Any unauthenticated request can deactivate a live disaster event.
2. **`DELETE /api/resources/:id` has no auth/role check** (`backend/src/routes/resources.js:118-126`). Any caller can delete any resource.
3. **`008_rls_audit_fixes.sql` grants `SELECT` on all public tables to `anon`**, including PII/audit tables (`audit_logs`, `incident_reports`, `alert_logs`, `misinformation_checks`, `push_subscriptions`). If any RLS policy on those tables is ever misconfigured or has a bypassable condition, anon read becomes wide open instead of being blocked by the grant itself. This is the opposite of defense-in-depth and directly contradicts the documented design intent (`docs/rls_matrix.md` says anon = Deny on these tables).

### P1 — Overstated/incomplete work
4. **RLS audit coverage gap**: `admin` role is never exercised in `backend/tests/integration/rls.test.js`, and only a handful of the 10×6 = 60 matrix cells are actually tested. The matrix doc should not say "Verified: Yes" on cells with no test behind them — that's a false claim in a document whose entire purpose is to be trustworthy evidence.
5. **`classify.py` docstrings actively misrepresent the system** (lines ~40, ~51: "rule-based + ML model," "NLP... HuggingFace API") when the service underneath (`sklearn_service.py`) is admittedly pure regex/rules. This isn't a cosmetic nit — it's the same "fake AI" credibility problem the project already got burned on once, recurring in comments after the code was fixed.
6. **P1-4 validation sweep — 5 concrete unvalidated write routes**, despite Zod already being in use elsewhere in the same files:
   - `backend/src/routes/admin.js:33` `PATCH /coordinators/:id`
   - `backend/src/routes/admin.js:144` `PATCH /users/:id` (also lets admin set an arbitrary `role` string — no enum check)
   - `backend/src/routes/events.js:139` `PATCH /:id/deactivate`
   - `backend/src/routes/alerts.js:63` `POST /subscribe`
   - `backend/src/routes/resources.js:118` `DELETE /:id`

### P2 — Hygiene / process
7. **Two stray nested git repos at project root**: `civicshield-ai/` (48K) and `civicshieldai/` (4.1M) contain nothing but `.git` internals — leftover from a bad clone/copy. Delete both.
8. **Debug/one-off scripts sitting at repo root and in `backend/src/`**: `check_drift.sh`, `fetch_states.js`, `setup_drift_check.sql`, `states_insert.sql`, `backend/gather_evidence.js`, `backend/fix_test_users.js`. Move to a `scripts/` directory or delete if no longer needed — they don't belong mixed in with application source.
9. **P1-6 work is unmerged**: branch `feature/p1-6-schema-drift` has 110 modified files outstanding. "COMPLETE" status in the scorecard should not be claimed for unmerged work — open the PR, get it to green CI, merge.
10. **Scorecard accuracy**: P1-2 row says "NOT DONE" when partial work exists. Going forward, scorecard rows must reflect actual repo state, not be edited optimistically.

---

## Tickets for the engineer

Same evidence rule as `PHASE1_TICKETS.md`: nothing is "done" without real, reproducible evidence (test output, CI run URL, curl output). No mocked tests satisfy a real-behavior gate. If a step needs my credentials, halt and ask.

### P2-0 — Fix open auth holes (🔴 block everything else until this lands)
- Add the same auth+role gate already used in `alerts.js`/`incidents.js` to `PATCH /api/events/:id/deactivate` and `DELETE /api/resources/:id` (coordinator/admin only).
- Grep the entire `backend/src/routes/` tree for every `router.delete`/`router.patch`/`router.put` and confirm each has an explicit auth check — list them all in your evidence, not just the two named here.
- **Evidence:** curl showing 401/403 on each route without/with wrong role, then 200 with correct role.

### P2-1 — Fix the anon GRANT in `008_rls_audit_fixes.sql`
- Replace the blanket `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon` with explicit per-table grants matching `docs/rls_matrix.md` intent — anon should not even have table-level SELECT on `audit_logs`, `incident_reports`, `alert_logs`, `misinformation_checks`, `push_subscriptions`.
- New migration, not an edit to 008 (008 may already be referenced elsewhere).
- **Evidence:** the new migration diff + `rls.test.js` run showing anon SELECT denied on those tables (at the grant level, not only the RLS-policy level — test should attempt the query as anon directly).

### P2-2 — Make the RLS matrix actually true
- Extend `backend/tests/integration/rls.test.js` to cover the `admin` role and all 10 tables, not a subset.
- Every "Yes" in `docs/rls_matrix.md` must correspond to an actual assertion in the test suite. Cells with no test get marked "Untested," not "Yes."
- **Evidence:** full test run output showing 60/60 cells exercised, plus the corrected matrix doc.

### P2-3 — Fix `classify.py` docstrings
- Remove/replace any text in `ml-service/app/routers/classify.py` claiming ML model usage or HuggingFace API — describe accurately what `sklearn_service.py` actually does (regex/rule-based).
- **Evidence:** diff of the docstrings; grep across `ml-service/` for "ML model"/"HuggingFace"/"sklearn" to confirm no other stale claims remain.

### P2-4 — Close remaining P1-4 validation gaps
- Add Zod schemas to the 5 routes listed in finding 6 above.
- **Evidence:** curl showing 400 on a malformed body for each of the 5 routes.

### P2-5 — Repo hygiene
- Delete `civicshield-ai/` and `civicshieldai/` stray directories.
- Move `check_drift.sh`, `fetch_states.js`, `setup_drift_check.sql`, `states_insert.sql`, `backend/gather_evidence.js`, `backend/fix_test_users.js` into a `scripts/` folder (or delete if dead).
- **Evidence:** `git status` / `ls` before and after.

### P2-6 — Land P1-6 for real
- Open the PR for `feature/p1-6-schema-drift`, get CI green, merge to `main`. Reconcile or intentionally discard the 110 uncommitted files — don't leave them dangling.
- **Evidence:** PR URL, CI run URL, merge commit SHA.

### P2-7 — Correct the scorecard
- Update `PROJECT_SCORECARD.md` P1-2 row to reflect actual partial frontend-test state, and note the still-missing pieces (useAuth, useDisasterEvents, LandingPage render, Playwright e2e) from the original `PHASE1_TICKETS.md` P1-2 scope.

## Reporting format (same as before — use it exactly)
```
[P2-x] DONE / NOT DONE / DISAGREE
Branch / PR:
Evidence: <real output / CI run URL — not mocked>
Notes:
```
I will re-verify every claim against the code myself before accepting any ticket as closed.
