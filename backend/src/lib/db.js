/**
 * backend/src/lib/db.js
 *
 * Supabase client singletons.
 *
 * Problem solved (m5): every file was calling createClient() on every
 * request, creating a new TCP connection each time. This module
 * exposes two lazily-initialised singletons:
 *
 *   getAdminDb()  — service_role key, bypasses RLS (backend use only)
 *   getAnonDb()   — anon key, respects RLS (used to verify JWTs)
 *
 * Both are created once and reused across the process lifetime.
 */
const { createClient } = require('@supabase/supabase-js');

let _adminDb = null;
let _anonDb  = null;

function getAdminDb() {
  if (!_adminDb) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('[DB] SUPABASE_URL or SUPABASE_SERVICE_KEY is not set');
    }
    _adminDb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _adminDb;
}

function getAnonDb() {
  if (!_anonDb) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('[DB] SUPABASE_URL or SUPABASE_ANON_KEY is not set');
    }
    _anonDb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  return _anonDb;
}

module.exports = { getAdminDb, getAnonDb };
