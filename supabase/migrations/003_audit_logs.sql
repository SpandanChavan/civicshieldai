-- 003_audit_logs.sql
-- Create audit_logs table for accountability tracking

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID, -- Can be null for system actions or unauthenticated actions
    action_type TEXT NOT NULL,
    entity_id TEXT, -- ID of the entity that was affected (alert_id, incident_id, etc)
    metadata JSONB, -- Additional contextual data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- RLS policies
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read all, standard users can read their own
CREATE POLICY "Service Role full access to audit_logs" 
ON public.audit_logs FOR ALL USING (auth.role() = 'service_role');

-- Create a Postgres Trigger for automatically logging new user signups
CREATE OR REPLACE FUNCTION public.log_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action_type, metadata)
  VALUES (NEW.id, 'USER_SIGNUP', jsonb_build_object('email', NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.log_new_user();
