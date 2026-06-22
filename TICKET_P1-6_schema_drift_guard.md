# Ticket P1-6 — Schema drift guard (schema.sql ⇄ migrations)

**Owner:** engineer
**Branch policy:** feature branch → PR → CI green → merge to `main`. No direct pushes to `main`.
**Evidence rule:** real CI output only. Show the guard going **red on a deliberate drift**, then green after revert. Halt and ask if a step needs my auth — never touch credentials.

## Why
`supabase/schema.sql` (the authoritative fresh-DB file) is exercised by **nothing** — CI provisions via `supabase start` → `migrations/`, and the Supabase GitHub integration also applies `migrations/`. So `schema.sql` can silently drift from the migrations and no one would know. That's the exact bug class that has bitten this project repeatedly (code/schema mismatch). Make drift **structurally detectable** in CI.

## Approach (generate-and-diff, against the real Supabase stack)
Do **not** diff hand-maintained text. Apply both paths to fresh databases inside the CI Supabase stack (which has the `auth` schema, so both apply cleanly), dump each schema, and fail if they differ.

1. **DB A — migrations:** the stack already applies `supabase/migrations/` on `supabase start`. Dump its `public` schema.
2. **DB B — schema.sql:** create a second database on the same local stack, apply `supabase/schema.sql` to it, dump its `public` schema.
3. **Normalize + diff:** strip volatile noise (comments, `SET`/ownership lines, ordering) so the comparison is semantic, then `diff`. Non-empty diff → fail with a clear message.

### Suggested CI step (add to the backend job, after `supabase start`)
```yaml
- name: Schema drift guard (schema.sql vs migrations)
  run: |
    PGURL_BASE="postgresql://postgres:postgres@127.0.0.1:54322"
    # DB A: migrations were applied by `supabase start` on the default 'postgres' db
    pg_dump --schema-only --no-owner --no-privileges -n public "$PGURL_BASE/postgres" \
      | grep -vE '^\s*--|^SET |^SELECT pg_catalog' | sort > /tmp/from_migrations.sql
    # DB B: fresh db, apply schema.sql
    psql "$PGURL_BASE/postgres" -c "DROP DATABASE IF EXISTS drift_check;" -c "CREATE DATABASE drift_check;"
    psql "$PGURL_BASE/drift_check" -c "CREATE EXTENSION IF NOT EXISTS postgis;" -f supabase/schema.sql
    pg_dump --schema-only --no-owner --no-privileges -n public "$PGURL_BASE/drift_check" \
      | grep -vE '^\s*--|^SET |^SELECT pg_catalog' | sort > /tmp/from_schema_sql.sql
    if ! diff -u /tmp/from_migrations.sql /tmp/from_schema_sql.sql; then
      echo "::error::supabase/schema.sql has drifted from supabase/migrations/. Regenerate or reconcile."
      exit 1
    fi
    echo "✅ schema.sql matches migrations"
```
> Tune the normalization (`grep -vE …` / `sort`) until a known-in-sync state passes cleanly. Some objects (extensions in `auth`, seed rows) may need exclusion — document any you exclude and why. `schema.sql` references `auth.users`, so it must run on the Supabase stack (which has `auth`), not raw Postgres.

## Alternative (if generate-and-diff proves too noisy)
Make `schema.sql` **generated, not hand-written**: a script/CI step dumps the migrations-built schema into `schema.sql`, and CI fails if the committed file differs from the freshly-generated one (`git diff --exit-code`). This makes drift impossible by construction. State which approach you chose and why.

## Acceptance criteria
- CI fails when `schema.sql` and `migrations/` define a different `public` schema; passes when they match.
- A **demonstrated red→green**: introduce a deliberate divergence (e.g., add a column to `schema.sql` only) on a throwaway branch → guard goes red → revert → green. Screenshot both.
- The guard runs inside the existing Supabase-in-CI backend job (reuses `supabase start`; no new secrets).

## Evidence required
```
[P1-6] DONE / NOT DONE / DISAGREE
Branch / PR:
Evidence: CI run URL (guard step green) + the red-on-deliberate-drift run + diff of the CI change
Notes: which approach (diff vs generate), and any objects excluded from comparison + why
```

## Out of scope
Applying 008 to prod, migration-history repair, and turning on auto-deploy — those are tracked separately and stay parked until done deliberately.
