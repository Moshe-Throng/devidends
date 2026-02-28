-- 002_profiles.sql — Extend profiles + cv_scores for profile system
-- Run this in Supabase SQL Editor AFTER 001_initial_schema.sql

-- ══════════════════════════════════════════════════════════════
-- 1. EXTEND PROFILES TABLE
-- ══════════════════════════════════════════════════════════════

-- Link to auth.users (one profile per authenticated user)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create unique index (only one profile per user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- Professional identity fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS headline TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Update profile_type CHECK constraint to include Mid-level and Entry
-- (Drop old constraint first, then recreate)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_profile_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_profile_type_check
  CHECK (profile_type IN ('Expert', 'Senior', 'Mid-level', 'Junior', 'Entry'));

-- Drop the email UNIQUE constraint (multiple profiles can share email, user_id is the unique key)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_email_key;

-- GIN indexes for array-based matching
CREATE INDEX IF NOT EXISTS idx_profiles_sectors ON profiles USING gin(sectors);
CREATE INDEX IF NOT EXISTS idx_profiles_donors ON profiles USING gin(donors);

-- ══════════════════════════════════════════════════════════════
-- 2. PROFILE EDIT HISTORY (light version control)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profile_edits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  snapshot JSONB,
  edited_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_edits_profile ON profile_edits(profile_id);

ALTER TABLE profile_edits ENABLE ROW LEVEL SECURITY;

-- Users can view their own edit history (via profile → user_id)
CREATE POLICY "Users can view own profile edits"
  ON profile_edits FOR SELECT
  USING (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own profile edits"
  ON profile_edits FOR INSERT
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- ══════════════════════════════════════════════════════════════
-- 3. EXTEND CV_SCORES TABLE
-- ══════════════════════════════════════════════════════════════

ALTER TABLE cv_scores
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS donor_tips JSONB;

CREATE INDEX IF NOT EXISTS idx_cv_scores_user_id ON cv_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_cv_scores_profile_id ON cv_scores(profile_id);

-- ══════════════════════════════════════════════════════════════
-- 4. RLS POLICIES FOR PROFILES
-- ══════════════════════════════════════════════════════════════

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public profiles viewable by all" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

-- Public profiles are viewable by everyone
CREATE POLICY "Public profiles viewable by all"
  ON profiles FOR SELECT
  USING (is_public = true);

-- Users can always see their own profile (even if not public)
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own profile
CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- 5. RLS POLICIES FOR CV_SCORES
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view own scores" ON cv_scores;
DROP POLICY IF EXISTS "Users can insert own scores" ON cv_scores;

CREATE POLICY "Users can view own scores"
  ON cv_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scores"
  ON cv_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- 6. AUTO-UPDATE TRIGGER FOR profiles.updated_at
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
