-- 008_devisor_intelligence.sql
-- Devisor: Bid intelligence layer for Devidends
-- Adds pipeline/tender intelligence fields to opportunities table
-- Run in Supabase SQL Editor AFTER 007_news_sectors_filter.sql

-- ══════════════════════════════════════════════════════════════
-- 1. OPPORTUNITIES — Devisor intelligence columns
-- ══════════════════════════════════════════════════════════════

-- Budget range for tenders/pipeline signals
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS budget_min NUMERIC,
  ADD COLUMN IF NOT EXISTS budget_max NUMERIC;

-- Procurement method (QCBS, QBS, LCS, IC, Shopping, Direct)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS procurement_method TEXT;

-- Pipeline stage tracks where this opportunity sits in the lifecycle
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;

DO $$
BEGIN
  ALTER TABLE opportunities
    ADD CONSTRAINT opportunities_pipeline_stage_check
    CHECK (pipeline_stage IN ('forecast', 'pipeline', 'published', 'awarded'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Donor reference number (e.g. solicitation number, IATI activity ID)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS donor_ref TEXT;

-- Framework contract (e.g. "FCDO GDD Lot 4", "EU FWC Lot 7")
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS framework TEXT;

-- Signal type: what kind of intelligence detected this
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS signal_type TEXT;

DO $$
BEGIN
  ALTER TABLE opportunities
    ADD CONSTRAINT opportunities_signal_type_check
    CHECK (signal_type IN (
      'iati_planned',
      'iati_winding_down',
      'donor_hiring',
      'usaid_forecast',
      'tender_published',
      'tender_reoi'
    ));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Signal confidence
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS signal_confidence TEXT;

DO $$
BEGIN
  ALTER TABLE opportunities
    ADD CONSTRAINT opportunities_signal_confidence_check
    CHECK (signal_confidence IN ('high', 'medium', 'low'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 2. UPDATE TYPE CONSTRAINT — add 'pipeline' for early signals
-- ══════════════════════════════════════════════════════════════

-- Drop old constraint and recreate with 'pipeline' added
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_type_check;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_type_check
  CHECK (type IN ('job', 'consulting', 'tender', 'pipeline'));

-- ══════════════════════════════════════════════════════════════
-- 3. INDEXES — for Devisor queries
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline_stage
  ON opportunities(pipeline_stage);

CREATE INDEX IF NOT EXISTS idx_opportunities_signal_type
  ON opportunities(signal_type);

CREATE INDEX IF NOT EXISTS idx_opportunities_budget
  ON opportunities(budget_min, budget_max);

CREATE INDEX IF NOT EXISTS idx_opportunities_type
  ON opportunities(type);

-- ══════════════════════════════════════════════════════════════
-- 4. SUBSCRIPTIONS — type filter for tender/pipeline preferences
-- ══════════════════════════════════════════════════════════════

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS type_filter TEXT[] DEFAULT '{}';
