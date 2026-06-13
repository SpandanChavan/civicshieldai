-- ====================================================
-- CivicShield AI - User Profiles & Auth Trigger
-- Run this in your Supabase SQL Editor
-- ====================================================

-- 1. Create the user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'citizen' CHECK (role IN ('citizen', 'coordinator', 'responder')),
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Turn on RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies
-- Anyone can view profiles (useful for displaying names/roles of reporters)
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.user_profiles FOR SELECT
  USING ( true );

-- Users can update their own profile (e.g. changing their role for the demo)
CREATE POLICY "Users can update own profile."
  ON public.user_profiles FOR UPDATE
  USING ( auth.uid() = id );

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile."
  ON public.user_profiles FOR INSERT
  WITH CHECK ( auth.uid() = id );

-- 4. Create a trigger to automatically create a user_profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    'citizen' -- Default role, the frontend will update this right after signup if they selected something else
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to prevent errors on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
