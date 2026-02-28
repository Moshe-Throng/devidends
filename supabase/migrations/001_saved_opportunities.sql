-- Saved opportunities table for bookmarking jobs
CREATE TABLE IF NOT EXISTS saved_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL,
  opportunity_title TEXT NOT NULL,
  opportunity_org TEXT NOT NULL DEFAULT 'Unknown',
  opportunity_deadline TIMESTAMPTZ,
  opportunity_url TEXT NOT NULL DEFAULT '',
  saved_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,

  -- Prevent duplicate saves
  UNIQUE(user_id, opportunity_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_saved_opportunities_user
  ON saved_opportunities(user_id);

-- RLS: users can only see/manage their own saved items
ALTER TABLE saved_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved opportunities"
  ON saved_opportunities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved opportunities"
  ON saved_opportunities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved opportunities"
  ON saved_opportunities FOR DELETE
  USING (auth.uid() = user_id);
