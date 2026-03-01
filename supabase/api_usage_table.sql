-- AI API usage tracking table
-- Run this in Supabase SQL Editor to enable cost tracking

CREATE TABLE IF NOT EXISTS api_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  model text NOT NULL,
  feature text NOT NULL,          -- 'cv_score', 'cv_extract', 'profile_extract'
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  cached boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for time-based queries (admin dashboard)
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage (created_at DESC);

-- Index for feature-based aggregation
CREATE INDEX IF NOT EXISTS idx_api_usage_feature ON api_usage (feature);

-- RLS: Only service role can insert/read (server-side only)
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by API routes)
CREATE POLICY "Service role full access" ON api_usage
  FOR ALL USING (true) WITH CHECK (true);
