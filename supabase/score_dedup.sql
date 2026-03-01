-- Score deduplication: Add cv_hash column for persistent cache lookups
-- Run this in Supabase SQL Editor

-- Add hash column for dedup lookups (SHA-256 of CV text)
ALTER TABLE cv_scores ADD COLUMN IF NOT EXISTS cv_hash text;

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_cv_scores_hash ON cv_scores (cv_hash) WHERE cv_hash IS NOT NULL;
