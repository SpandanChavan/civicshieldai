#!/bin/bash
DOCKER_CMD="docker exec -i supabase_db_civicshield-ai"

# DB A: migrations
$DOCKER_CMD pg_dump --schema-only --no-owner --no-privileges -n public -U postgres -d postgres \
  | grep -vE '^\s*--|^SET |^SELECT pg_catalog' \
  | grep -vE '^\\restrict|^\\unrestrict' \
  > /tmp/from_migrations.sql

# DB B: schema.sql
$DOCKER_CMD psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS drift_check;" -c "CREATE DATABASE drift_check;"

# auth and extensions stub
$DOCKER_CMD psql -U postgres -d drift_check -c "
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS \$\$ SELECT NULL::uuid \$\$ LANGUAGE sql;
  CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS \$\$ SELECT NULL::text \$\$ LANGUAGE sql;
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;
"

cat supabase/schema.sql | $DOCKER_CMD psql -U postgres -d drift_check

$DOCKER_CMD pg_dump --schema-only --no-owner --no-privileges -n public -U postgres -d drift_check \
  | grep -vE '^\s*--|^SET |^SELECT pg_catalog' \
  | grep -vE '^\\restrict|^\\unrestrict' \
  > /tmp/from_schema_sql.sql

diff -u /tmp/from_migrations.sql /tmp/from_schema_sql.sql
