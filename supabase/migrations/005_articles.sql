-- 005_articles.sql
-- Store crawled development news articles.
-- Run in Supabase SQL Editor AFTER 004_cv_structured_data.sql

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT UNIQUE NOT NULL,
  source_name TEXT NOT NULL,
  source_id TEXT,
  published_at TIMESTAMPTZ,
  category TEXT,
  is_relevant BOOLEAN DEFAULT true,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles (url);
