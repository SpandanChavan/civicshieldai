# CivicShield AI — Production Deploy Checklist

The platform's `main` branch is ahead of the **production Supabase database**. Migrations `008` and `009` carry **real fixes that prod needs but does not yet have**, because Supabase auto-deploy is intentionally OFF (the hosted DB's migration history is untracked, so a naive deploy would try to re-run `001`'s bare `CREATE TABLE` and error).

This checklist is the safe path to bring production current. Do it deliberately — not via an accidental merge.

## What prod is currently missing
- **008** — least-privilege grants + RLS hardening (anon=SELECT only; closed the `GRANT ALL TO anon` TRUNCATE hole), `misinformation_checks` RLS, service-role policies.
- **009** — `incident_reports.status` default fixed (`'pending'` → `'pending_review'`; the old default **violates the canonical CHECK**), 3 stale trigger functions dropped, 4 stale/over-permissive RLS policies dropped (incl. `"Public profiles are viewable by everyone."`), `audit_logs.id`/`misinformation_checks` defaults aligned.

## Steps (in order)
1. **Back up the production database first** (Supabase dashboard → Database → Backups, or `pg_dump`). Non-negotiable.
2. **Link the CLI to the hosted project** yourself (`supabase link`) — do NOT hand the agent credentials.
3. **Inspect migration history:** `supabase migration list`. Expect 001–007 to be physically applied but possibly NOT recorded in `supabase_migrations.schema_migrations`.
4. **Repair history** so already-applied migrations are marked without re-running:
   `supabase migration repair --status applied 001 002 003 004 005 006 007`
   (adjust to whatever `migration list` shows as applied-but-unrecorded).
5. **Dry-run / review:** `supabase db push --dry-run` — confirm it intends to apply ONLY `008` and `009`, nothing else.
6. **Apply:** `supabase db push`. Watch for zero errors.
7. **Verify on prod:**
   - `SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef … ` or simply check `incident_reports.status` default is now `pending_review`.
   - Confirm `"Public profiles are viewable by everyone."` policy is gone.
   - `SELECT proname FROM pg_proc WHERE proname IN ('handle_new_user','handle_new_user_and_audit','log_new_user');` → empty.
   - Smoke the app: signup → submit report → coordinator approve.
8. **Only then** consider enabling the Supabase GitHub auto-deploy toggle — now that history is recorded, future merges apply cleanly.

## Standing rules
- **Agent never handles credentials.** Any `supabase link`/`push` runs in your own terminal.
- **`schema.sql` is hand-written** — re-align it whenever a migration changes the dump, or the P1-6 drift guard will (correctly) fail CI.
- Keep auto-deploy OFF until steps 1–7 are done and verified.
