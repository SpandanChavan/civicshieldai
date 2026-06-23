-- ==============================================================================
-- One-off Reconciliation Script
-- Safely bridges the divergent production database to our expected state (008, 009).
-- ==============================================================================

BEGIN;

-- 1. Create the unified handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user_unified()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    -- 1. Create user profile
    INSERT INTO public.user_profiles (id, full_name, role)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      COALESCE(NEW.raw_user_meta_data->>'role', 'citizen')
    )
    ON CONFLICT (id) DO NOTHING;
  
    -- 2. Write audit log
    INSERT INTO public.audit_logs (user_id, action_type, metadata)
    VALUES (
      NEW.id,
      'USER_SIGNUP',
      jsonb_build_object('email', NEW.email)
    );
  
    RETURN NEW;
  END;
$$;

-- 2. Repoint the auth trigger SAFELY before dropping the old one
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_unified();

-- 3. Now we can safely drop the old legacy trigger functions
DROP FUNCTION IF EXISTS public.handle_new_user_and_audit() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.log_new_user() CASCADE;

-- 4. Apply 008 Grants to remove TRUNCATE permissions
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 5. Add 008 missing RLS
ALTER TABLE public.misinformation_checks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Service Role full access to alert_logs" ON public.alert_logs FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role full access to incident_reports" ON public.incident_reports FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DROP POLICY IF EXISTS "Service role reads all push subscriptions" ON public.push_subscriptions;
DO $$ BEGIN CREATE POLICY "Service role manages push subscriptions" ON public.push_subscriptions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 6. Reconcile get_state_from_point and assign_report_state
-- Create the new double precision version
CREATE OR REPLACE FUNCTION public.get_state_from_point(lat DOUBLE PRECISION, lon DOUBLE PRECISION)
  RETURNS UUID AS $$
  DECLARE
    matched_id UUID;
  BEGIN
    SELECT id INTO matched_id
    FROM public.states
    WHERE lat BETWEEN bbox_south AND bbox_north
      AND lon BETWEEN bbox_west  AND bbox_east
    ORDER BY
      (bbox_north - bbox_south) * (bbox_east - bbox_west) ASC
    LIMIT 1;
  
    RETURN matched_id;
  END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Update the auto-state_id trigger function so it relies on the double precision version
CREATE OR REPLACE FUNCTION public.assign_report_state() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.location IS NOT NULL AND NEW.state_id IS NULL THEN
    NEW.state_id := public.get_state_from_point(
      ST_Y(NEW.location::geometry)::double precision,
      ST_X(NEW.location::geometry)::double precision
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Drop the old numeric overload since nothing relies on it anymore
DROP FUNCTION IF EXISTS public.get_state_from_point(numeric, numeric) CASCADE;

-- 7. Apply 009 fixes
ALTER TABLE public.incident_reports ALTER COLUMN status SET DEFAULT 'pending_review';
ALTER TABLE public.audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Coordinators read state reports" ON public.incident_reports;

COMMIT;
