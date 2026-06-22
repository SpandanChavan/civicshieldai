-- ============================================================================
-- Migration 008: RLS Audit Fixes & Explicit Grants
-- ============================================================================

-- 1. Add missing Service Role policies
ALTER TABLE public.misinformation_checks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Service Role full access to alert_logs" ON public.alert_logs FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Service role full access to incident_reports" ON public.incident_reports FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Upgrade push_subscriptions for service_role from SELECT to ALL
DROP POLICY IF EXISTS "Service role reads all push subscriptions" ON public.push_subscriptions;
DO $$ BEGIN CREATE POLICY "Service role manages push subscriptions" ON public.push_subscriptions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Explicitly GRANT permissions to ensure local/hosted parity with least privilege
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
