# Phase 1 — Hand-off Tickets

**From:** Project Manager
**Branch policy:** feature branch → PR → CI green → merge to `main`. No direct pushes to `main`.
**Evidence rule:** nothing is "done" without the evidence block filled in with *real* output (DB results, test runs, CI run URL). Mocked tests do not satisfy a gate that's about real behavior. If a step needs my auth, halt and ask — never touch credentials.

Order: **P1-1 and P1-3 first** (security + the test harness), then the rest.

---

## P1-1 — RLS audit against the access matrix  🔴 highest priority
**Why:** RLS is our defense-in-depth if the backend service-role key ever leaks or a query bypasses a check. It has never been verified end-to-end against intended access. This is the lowest-confidence security area.

**Scope**
- Produce the intended access matrix (rows = tables, cols = roles: anon, citizen, coordinator, responder, admin, service_role) for: `events, alerts, resources, incident_reports, alert_logs, user_profiles, states, audit_logs, misinformation_checks, push_subscriptions`.
- For each cell, test the ACTUAL behavior with a real JWT for that role (not service-role) and record allow/deny for SELECT/INSERT/UPDATE/DELETE.
- Fix any policy that doesn't match intent. Pay special attention to:
  - anon cannot read `incident_reports`, `audit_logs`, `misinformation_checks`, `push_subscriptions`, `user_profiles` PII.
  - citizen can read only their own `incident_reports`, not others'.
  - coordinator/responder reads scoped appropriately; only coordinator/admin can update report status.
  - `audit_logs` is service-role only (no client read/write).

**Acceptance criteria**
- A committed `docs/rls_matrix.md` (intended vs. verified).
- A repeatable script `backend/tests/integration/rls_audit.js` that signs in as each role and asserts allow/deny per table, exiting non-zero on any mismatch.
- Zero mismatches on the final run.

**Evidence required**
- The matrix doc.
- The full `rls_audit.js` output showing every assertion passing.
- Diffs of any policy changes (in `schema.sql` + a new migration).

**Status:** [ ] — _notes:_

---

## P1-3 — Real (non-mocked) integration test harness in CI  🔴 highest priority
**Why:** Our "proofs" have been manual scripts run by hand. They must become automated tests that run in CI against a real Postgres, so regressions are caught without a human.

**Scope**
- Add a Postgres+PostGIS service to a CI job; apply `supabase/schema.sql` to it on startup (this also continuously proves the schema applies clean).
- Promote the existing `tests/integration/*` scripts into a real runner (Jest or node:test) with assertions and exit codes — covering: auth gates (allow AND deny), incident lifecycle (submit→approve→reject), alert create + `alert_logs`, predictions with mocked *upstream HTTP* (but real DB), and `get_state_from_point`.
- Note: `auth.users` / `auth.uid()` are Supabase-specific. Either use a Supabase test project in CI (preferred) or stub the `auth` schema minimally for the local Postgres service — document whichever you choose.

**Acceptance criteria**
- `npm run test:integration` runs the suite against a real DB and passes.
- CI runs it on every PR; a deliberate breaking change makes CI red (demonstrate this).

**Evidence required**
- CI run URL showing the integration job green.
- A screenshot/log of CI going red when you intentionally break one assertion (then revert).

**Status:** [ ] — _notes:_

---

## P1-2 — First frontend tests
**Why:** The React app has no test coverage; a regression already slipped through once (the texture removal).

**Scope**
- Vitest + Testing Library tests for: `useAuth` (role/loading transitions), `ProtectedRoute` (redirects by role), `useDisasterEvents` (store updates on data), and a render smoke test for `LandingPage` (globe textures resolve / no crash).
- One Playwright end-to-end: guest → login → land on role home → submit an incident.

**Acceptance criteria**
- `npm run test:ci` (frontend) includes these and passes in CI.
- Playwright run green in CI (headless).

**Evidence required:** CI run URL with the frontend + e2e jobs green. **Status:** [ ]

---

## P1-4 — Output sanitization & validation sweep
**Why:** Close the remaining injection/validation gaps beyond the alert-HTML fix already shipped.

**Scope**
- Audit every write route for Zod validation; add where missing (events deactivate, admin user/coordinator PATCH bodies, alerts subscribe payload shape).
- Confirm any other place user/external text is rendered into HTML/Markdown is escaped.

**Acceptance criteria:** every write route validates input and rejects malformed bodies with 400.
**Evidence required:** list of routes + their schema; curl showing a 400 on a bad body for each. **Status:** [ ]

---

## P1-5 — Observability: ingestion + alert-delivery visibility
**Why:** We store `alert_logs` and run cron ingestion but surface neither; we're blind to failures.

**Scope**
- `/health` (or a new `/status`) reports each cron's last-run timestamp and last result.
- An admin endpoint (or a Cowork artifact) summarizing `alert_logs` delivery success/failure per channel over the last N days.
- Confirm Sentry is actually receiving events from backend, frontend, and ML (trigger a test error in each).

**Acceptance criteria:** cron freshness visible; alert delivery rates queryable; a test error appears in Sentry from all three services.
**Evidence required:** the status payload, the delivery summary output, and Sentry screenshots. **Status:** [ ]

---

## P1-6 — Migration drift guard in CI
**Why:** The exact bug class that bit us twice (code referencing columns the schema lacks).

**Scope**
- A CI check that fails if the code references a table/column not present in `schema.sql`. Simplest viable version: a script that greps `from('<table>')` / known column usages and diffs against the schema; or apply the schema to the CI Postgres and run a smoke query per table the code touches.

**Acceptance criteria:** introducing a reference to a non-existent column makes CI red (demonstrate, then revert).
**Evidence required:** CI run showing the guard catching a deliberate drift. **Status:** [ ]

---

## Reporting format (per ticket)
```
[P1-x] DONE / NOT DONE / DISAGREE
Branch / PR:
Evidence: <real output / CI run URL / screenshots — not mocked>
Notes:
```
Open one PR per ticket (or small logical group). I review line-by-line and re-run the evidence.
