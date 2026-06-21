# CivicShield AI — Round 2 Verification (Engineer Report Review)

**Reviewer:** Project Manager (senior)
**Date:** 2026-06-21
**Method:** Every claim was verified against the actual source files. The engineer's report and its test output were **not** taken on trust.
**Verdict:** ⛔ **REJECTED for deployment.** ~90% of the fixes are real and well done. But the one item that gates a clean deploy — the migration chain — was reported as fixed and is not, and was clearly never run against a fresh database. No real DB-backed evidence was supplied; all "evidence" is SQL snippets or **mocked** unit tests.

---

## 1. Verified as genuinely fixed (credit where due)

| Item | Status | Verified in code |
|------|--------|------------------|
| B1 states table | ✅ | `006`: table w/ `capital`, `bbox_*` + 36 seeded rows |
| B2 state_id FKs | ⚠️ mostly | `006`: added to `user_profiles`, `incident_reports`, `events`, `alerts` — but `events.state_id` is never populated (see §3) |
| B3 incident status | ✅ | `006`: CHECK migrated to 5 canonical values + data backfill; code agrees |
| B5 web push | ✅ | subscribe writes `p256dh`/`auth`; `sendWebPush` reshapes to `{endpoint, keys:{p256dh,auth}}` |
| B6 get_state_from_point | ✅ | `006`: PostGIS bbox function, granted to roles |
| B8 auth gates | ✅ | `DELETE /alerts/:id` and `PATCH /incidents/:id/status` now require coordinator/admin |
| M1 real prediction data | ✅ | Open-Meteo GloFAS / USGS FDSN / Open-Meteo temps, `demo:true` fallback labeled; `RIVER_STATIONS`/`getSeismicZone` exports added so it won't crash |
| M2 ML honesty | ✅ | `sklearn_service.py` docstring corrected; dead HuggingFace code removed |
| M4 resource decrement | ✅ | `consumed_ids` set prevents double-assignment |
| M5 event dedup | ✅ | India-bbox filter delegates to NCS poller |
| m1–m7 | ✅ | cwc fix, dedicated SMS number, translate guard, jitter removed, `lib/db.js` singleton, stateScope cache, env docs |

This is a lot of correct, real work. It is acknowledged.

---

## 2. ⛔ BLOCKER — false claim, deploy gate still fails

### [B4] "005 no longer applies since 006 drops and recreates" — **FALSE**
- Migrations execute in **numeric order**: `001 → 002 → 003 → 004 → 005 → 006`. 006 does not and cannot prevent 005 from running first.
- `005_schema_patch.sql` was left **unchanged**. It still runs `ALTER TABLE misinformation_checks ENABLE ROW LEVEL SECURITY;` (and ADD COLUMN / ADD CONSTRAINT) on a table **no earlier migration creates**.
- Result on a clean database: `supabase db reset` **aborts at 005**. The excellent migration 006 **never executes**. The whole schema is therefore absent on a fresh deploy.
- Running 006 alone does not help either — it `ALTER`s `user_profiles`, which only exists after 002.
- **This is precisely why the report contains no fresh-DB apply log.** That log was a hard gate. Its absence + this bug means a clean migration run was never performed.

**PM action taken:** I applied the minimal fix to `005` myself — a `CREATE TABLE IF NOT EXISTS public.misinformation_checks (...)` immediately before the first statement that touches it (idempotent; 006's create becomes a no-op). The chain should now apply. **You must still prove it** — see §4.

---

## 3. New defects found during verification (not on the original list)

### [N1] 🟠 Socket.io room scoping is self-asserted (insecure)
- `app.js` reads `role` and `state_id` from `socket.handshake.auth` — **client-supplied and never verified**. Any client can connect with `auth:{ role:'admin', state_id:'<any>' }` and join `role:admin` / `state:<x>` rooms.
- No active leak today (the cron only emits to `public`), but the scoping is security theater and will leak the instant anything is emitted to a scoped room.
- **Required:** verify the Supabase JWT in a Socket.io handshake middleware; derive role/state server-side from the verified token, not from client input.

### [N2] 🟠 `events.state_id` is never populated
- `006` adds the column, but `upsertEvents` (cron) and the data services never set it. The admin dashboard's per-state **event** breakdown will still be all zeros.
- **Required:** resolve and set `state_id` (via `get_state_from_point`) when upserting events, the same way incidents already do.

---

## 4. What "DONE" requires now (hard gates — no exceptions)

Mocked tests do **not** count for any of these. Run against a real, freshly-reset database.

1. **Clean migration apply.** Paste the **full** `supabase db reset` (or fresh apply) log showing **zero errors**, end to end.
2. **Schema proof:**
   - `SELECT count(*) FROM states;` → expect **36**
   - `SELECT get_state_from_point(28.61, 77.20);` → expect the **Delhi** UUID
   - `SELECT get_state_from_point(0, 0);` → expect **NULL** (outside India)
3. **Real smoke flow (non-mocked, actual HTTP + DB):** citizen submits a report → coordinator approves → coordinator rejects another. Paste the three responses **and** `SELECT id, status, reviewer_id, reviewed_at, state_id FROM incident_reports;` for those rows.
4. **N1:** socket handshake rejects a forged `role:'admin'` (show the rejection).
5. **N2:** after a poll cycle, `SELECT count(*) FROM events WHERE state_id IS NOT NULL;` is > 0.

## 5. Report-back format
For each of B4, N1, N2 (and re-confirm gates 1–3):
```
[ID] DONE / NOT DONE / DISAGREE
Commit/diff: <link or paste>
Evidence: <fresh-DB log / SQL output / curl response / screenshot>  ← NOT mocked tests
Notes:
```

**Bottom line:** the engineering quality on the feature work is good. The process failure is serious: an item was marked DONE with a confidently wrong justification, against evidence that could not have validated it. That is the difference between "works in tests" and "deploys." I sign off when gates 1–5 are met with real evidence — not before.
