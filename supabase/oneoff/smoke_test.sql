INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, deleted_at, phone, phone_confirmed_at, phone_change, phone_change_token, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_super_admin)
VALUES ('5e56e409-dc0a-4ff1-bba2-dbd4399e46a7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'testrehearsal@example.com', '', now(), NULL, NULL, now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Rehearsal User","role":"citizen"}', false, NULL, NULL, NULL, '', '', '', 0, NULL, '', NULL, false);

SELECT 'USER PROFILE:' as section;
SELECT * FROM public.user_profiles WHERE id = '5e56e409-dc0a-4ff1-bba2-dbd4399e46a7';

SELECT 'AUDIT LOGS:' as section;
SELECT * FROM public.audit_logs WHERE user_id = '5e56e409-dc0a-4ff1-bba2-dbd4399e46a7';

SELECT 'TRIGGERS ON AUTH.USERS:' as section;
SELECT tgname, proname FROM pg_trigger JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid WHERE tgname = 'on_auth_user_created';
