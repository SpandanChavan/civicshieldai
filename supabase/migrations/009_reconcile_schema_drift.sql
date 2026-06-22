-- ==============================================================================
-- Migration 009: Reconcile schema drift
-- ==============================================================================

-- 1. Fix CHECK-violating default on incident_reports
ALTER TABLE public.incident_reports ALTER COLUMN status SET DEFAULT 'pending_review';

-- 2. Drop stale trigger functions (replaced by handle_new_user_unified)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_and_audit() CASCADE;
DROP FUNCTION IF EXISTS public.log_new_user() CASCADE;

-- 3. Drop stale/over-permissive policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Coordinators read state reports" ON public.incident_reports;

-- 4. Update audit_logs.id default to native gen_random_uuid()
ALTER TABLE public.audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
