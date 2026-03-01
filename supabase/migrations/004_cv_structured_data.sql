-- 004_cv_structured_data.sql
-- Store structured CV data (StructuredCvData) on profiles for the CV builder.
-- Run in Supabase SQL Editor AFTER 003_search_scoring_alerts.sql

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cv_structured_data JSONB;
