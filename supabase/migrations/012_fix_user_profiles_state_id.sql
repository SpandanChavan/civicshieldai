CREATE OR REPLACE FUNCTION public.handle_new_user_unified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role, state_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'citizen'),
    NULLIF(NEW.raw_user_meta_data->>'state_id', '')::uuid
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent if row somehow exists

  INSERT INTO public.audit_logs (user_id, action_type, metadata)
  VALUES (
    NEW.id,
    'USER_SIGNUP',
    jsonb_build_object('email', NEW.email)
  );

  RETURN NEW;
END;
$$;
