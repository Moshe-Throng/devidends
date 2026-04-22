-- Attributions table: any economic contribution a network member makes
-- (intros, candidate recommendations, placements, subcontracts, referrals).
-- One mental model, used both for forward-looking tracking and backfill of
-- pre-digitization Envest history.

create table if not exists attributions (
  id uuid primary key default gen_random_uuid(),

  attribution_type text,
  -- intro_firm | recommend_candidate | bid_submission |
  -- placement_expert | placement_intern | subcontract |
  -- referral_member | direct_placement | service_delivered

  contributor_profile_id uuid references profiles(id),
  subject_profile_id uuid references profiles(id),

  firm_name text,
  firm_contact_name text,
  firm_contact_email text,

  opportunity_title text,
  sector text[],

  bid_type text,
  days_worked numeric,
  day_rate_usd numeric,
  gross_fee_usd numeric,

  expected_value_usd numeric,
  share_pct numeric default 10,
  paid_to_contributor_usd numeric default 0,

  stage text default 'introduced',
  -- introduced | proposed | won | invoiced | paid | lost | withdrawn | in_preparation

  occurred_at date,
  introduced_at timestamptz default now(),
  won_at timestamptz,
  paid_at timestamptz,

  source_of_record text,
  confidence text default 'high',
  source_url text,
  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_attr_contributor on attributions(contributor_profile_id);
create index if not exists idx_attr_subject on attributions(subject_profile_id);
create index if not exists idx_attr_stage on attributions(stage);
create index if not exists idx_attr_firm on attributions(firm_name);

alter table attributions enable row level security;
-- Service role bypasses RLS. No public policies yet.
