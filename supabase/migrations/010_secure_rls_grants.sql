-- ============================================================================
-- Migration 010: Secure RLS Grants
-- ============================================================================

-- 1. Remove the dangerous public grants
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- 2. Ensure service_role has full access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 3. Granular Grants matching docs/rls_matrix.md
-- anon grants (SELECT only, restricted by RLS)
GRANT SELECT ON public.states TO anon;
GRANT SELECT ON public.events TO anon;
GRANT SELECT ON public.alerts TO anon;
GRANT SELECT ON public.resources TO anon;
-- (anon is denied SELECT on all others by the matrix, so no grant needed for them)

-- authenticated grants
GRANT SELECT ON public.states TO authenticated;
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT ON public.alerts TO authenticated;
GRANT SELECT ON public.resources TO authenticated;
GRANT SELECT ON public.incident_reports TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.misinformation_checks TO authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;

-- authenticated INSERT grants
GRANT INSERT ON public.events TO authenticated;
GRANT INSERT ON public.alerts TO authenticated;
GRANT INSERT ON public.resources TO authenticated;
GRANT INSERT ON public.incident_reports TO authenticated;
GRANT INSERT ON public.user_profiles TO authenticated;
GRANT INSERT ON public.push_subscriptions TO authenticated;

-- authenticated UPDATE grants
GRANT UPDATE ON public.events TO authenticated;
GRANT UPDATE ON public.alerts TO authenticated;
GRANT UPDATE ON public.resources TO authenticated;
GRANT UPDATE ON public.incident_reports TO authenticated;
GRANT UPDATE ON public.user_profiles TO authenticated;
GRANT UPDATE ON public.push_subscriptions TO authenticated;

-- authenticated DELETE grants
GRANT DELETE ON public.events TO authenticated;
GRANT DELETE ON public.alerts TO authenticated;
GRANT DELETE ON public.resources TO authenticated;
GRANT DELETE ON public.incident_reports TO authenticated;
GRANT DELETE ON public.push_subscriptions TO authenticated;

-- Ensure sequences can be used
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
