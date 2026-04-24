-- Inbound Devex alert emails are parsed into rows here. Each row is one
-- opportunity (job or tender) that Devex sent us. Matched against our
-- internal opportunities table to measure how well our crawlers cover what
-- Devex sees.

create table if not exists devex_benchmark (
  id uuid primary key default gen_random_uuid(),
  -- Source email metadata
  inbound_email_id text,              -- Resend's webhook event id, unique
  email_subject text,
  email_from text,
  email_received_at timestamptz default now(),
  batch_date date,                    -- the day this feed is for
  alert_type text,                    -- 'devidends_alert' | 'jobs' | 'business_alert' | 'other'

  -- Extracted opportunity
  title text,
  url text,                           -- Devex's link (usually /jobs/xxx or /funding/xxx)
  resolved_url text,                  -- after redirect unwrap, the real source URL
  organization text,
  country text,
  sectors text[],
  posted_date date,
  deadline date,
  raw_snippet text,                   -- the HTML fragment we parsed this from, for debugging

  -- Match result
  matched_opportunity_id uuid references opportunities(id),
  match_method text,                  -- exact_url | fuzzy_title | org_country_date | none
  match_confidence numeric,           -- 0.0 to 1.0
  matched_at timestamptz,
  miss_domain text,                   -- source_domain of resolved_url when unmatched

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_devex_batch_date on devex_benchmark(batch_date);
create index if not exists idx_devex_matched on devex_benchmark(matched_opportunity_id);
create index if not exists idx_devex_miss_domain on devex_benchmark(miss_domain);
create index if not exists idx_devex_alert_type on devex_benchmark(alert_type);

alter table devex_benchmark enable row level security;

-- Daily summary view: coverage + miss domains for any given batch date
create or replace view devex_coverage_daily as
select
  batch_date,
  alert_type,
  count(*) as total_entries,
  count(matched_opportunity_id) as matched,
  (count(matched_opportunity_id)::numeric / nullif(count(*), 0)) as coverage_pct,
  count(*) filter (where miss_domain is not null) as misses
from devex_benchmark
where batch_date is not null
group by batch_date, alert_type
order by batch_date desc, alert_type;

-- Miss-domain leaderboard: which domains keep showing up as un-crawled
create or replace view devex_miss_domains as
select
  miss_domain,
  count(*) as miss_count,
  min(email_received_at) as first_seen,
  max(email_received_at) as last_seen,
  array_agg(distinct alert_type) as alert_types
from devex_benchmark
where miss_domain is not null and matched_opportunity_id is null
group by miss_domain
order by miss_count desc;
