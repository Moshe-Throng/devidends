-- 003_search_scoring_alerts.sql
-- Consolidated migration for:
--   1. CV scoring tied to opportunities (Phase 2B)
--   2. Alert preferences (Phase 2C)
--   3. Full-text search on profiles (Phase 3D)
--   4. Subscription security RLS (Phase 1A)
--   5. Deadline index (Phase 1E)
--
-- Run in Supabase SQL Editor AFTER 002_profiles.sql

-- ══════════════════════════════════════════════════════════════
-- 1. CV SCORING — OPPORTUNITY CONTEXT
-- ══════════════════════════════════════════════════════════════

ALTER TABLE cv_scores
  ADD COLUMN IF NOT EXISTS opportunity_id TEXT,
  ADD COLUMN IF NOT EXISTS opportunity_title TEXT,
  ADD COLUMN IF NOT EXISTS cv_hash TEXT;

-- Prevent re-scoring same CV against same opportunity
CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_scores_opp_unique
  ON cv_scores (user_id, opportunity_id, cv_hash)
  WHERE opportunity_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- 2. ALERT PREFERENCES — WORK TYPE + FREQUENCY
-- ══════════════════════════════════════════════════════════════

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS work_type_filter TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'weekly';

-- Add CHECK constraint for frequency (drop first if exists)
DO $$
BEGIN
  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_frequency_check
    CHECK (frequency IN ('daily', 'weekly'));
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 3. FULL-TEXT SEARCH ON PROFILES (Phase 3D)
-- ══════════════════════════════════════════════════════════════

-- Add tsvector column (plain column, NOT generated — to_tsvector is STABLE, not IMMUTABLE)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cv_search tsvector;

-- GIN index for fast FTS queries
CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles USING GIN (cv_search);

-- Skills normalization column for exact matching
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skills_normalized TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_profiles_skills_norm ON profiles USING GIN (skills_normalized);

-- Trigger function: recompute cv_search on every insert/update
CREATE OR REPLACE FUNCTION profiles_update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cv_search :=
    setweight(to_tsvector('english', coalesce(NEW.headline, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.skills, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.qualifications, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.cv_text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_search_vector ON profiles;
CREATE TRIGGER trg_profiles_search_vector
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_update_search_vector();

-- Backfill: update cv_search for all existing rows
UPDATE profiles SET cv_search =
  setweight(to_tsvector('english', coalesce(headline, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(array_to_string(skills, ' '), '')), 'A') ||
  setweight(to_tsvector('english', coalesce(qualifications, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(cv_text, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(name, '')), 'D')
WHERE cv_search IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 4. SUBSCRIPTION SECURITY — RLS POLICIES
-- ══════════════════════════════════════════════════════════════

-- Users can manage their own subscriptions (by email match)
-- Note: auth.email() returns the authenticated user's email
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON subscriptions;
CREATE POLICY "Users can delete own subscriptions"
  ON subscriptions FOR DELETE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ══════════════════════════════════════════════════════════════
-- 5. PERFORMANCE — DEADLINE INDEX
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);

-- ══════════════════════════════════════════════════════════════
-- 6. SEARCH FUNCTION — Ranked profile search
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_profiles(
  search_query TEXT,
  sector_filter TEXT[] DEFAULT NULL,
  donor_filter TEXT[] DEFAULT NULL,
  min_experience INTEGER DEFAULT NULL,
  type_filter TEXT DEFAULT NULL,
  result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  headline TEXT,
  email TEXT,
  sectors TEXT[],
  donors TEXT[],
  skills TEXT[],
  years_of_experience INTEGER,
  profile_type TEXT,
  rank REAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.headline,
    p.email,
    p.sectors,
    p.donors,
    p.skills,
    p.years_of_experience,
    p.profile_type,
    ts_rank_cd(p.cv_search, websearch_to_tsquery('english', search_query)) AS rank
  FROM profiles p
  WHERE
    -- Must match search query
    p.cv_search @@ websearch_to_tsquery('english', search_query)
    -- Optional sector filter (overlap)
    AND (sector_filter IS NULL OR p.sectors && sector_filter)
    -- Optional donor filter (overlap)
    AND (donor_filter IS NULL OR p.donors && donor_filter)
    -- Optional minimum experience
    AND (min_experience IS NULL OR p.years_of_experience >= min_experience)
    -- Optional profile type
    AND (type_filter IS NULL OR p.profile_type = type_filter)
    -- Only public profiles
    AND p.is_public = true
  ORDER BY rank DESC
  LIMIT result_limit;
END;
$$;
