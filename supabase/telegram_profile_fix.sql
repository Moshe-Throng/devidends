-- Fix: Allow Telegram-only profiles without a Supabase auth user
-- Run this in Supabase SQL Editor

-- 1. Drop foreign key constraint on user_id (if it exists)
--    This allows telegram profiles with user_id = NULL
DO $$
BEGIN
  -- Try dropping the FK constraint (common names)
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey1;
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_user_id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No FK constraint found on profiles.user_id — OK';
END $$;

-- 2. Make user_id nullable (so Telegram users don't need an auth account)
ALTER TABLE profiles ALTER COLUMN user_id DROP NOT NULL;

-- 3. Add unique constraint on telegram_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_id
  ON profiles (telegram_id) WHERE telegram_id IS NOT NULL;

-- 4. Update RLS to allow service role to manage telegram profiles
-- (Service role bypasses RLS, but ensure anon can read public profiles)
DO $$
BEGIN
  -- Allow anon to read public profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Public profiles are viewable'
  ) THEN
    CREATE POLICY "Public profiles are viewable" ON profiles
      FOR SELECT USING (is_public = true);
  END IF;
END $$;
