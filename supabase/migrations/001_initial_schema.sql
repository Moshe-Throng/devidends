-- Devidends Initial Schema
-- Run this in Supabase SQL Editor

-- Table 1: profiles
create table if not exists profiles (
  id uuid default gen_random_uuid() primary key,
  email text unique,
  phone text,
  telegram_id text,
  name text not null,
  cv_url text,
  cv_text text,
  cv_score integer,
  sectors text[] default '{}',
  donors text[] default '{}',
  countries text[] default '{}',
  skills text[] default '{}',
  qualifications text,
  profile_type text check (profile_type in ('Expert', 'Senior', 'Mid', 'Junior')),
  profile_score_pct integer default 0,
  recommended_by text,
  source text default 'web',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table 2: opportunities
create table if not exists opportunities (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  deadline timestamptz,
  organization text,
  donor text,
  country text,
  sectors text[] default '{}',
  type text check (type in ('job', 'consulting', 'tender')),
  experience_level text,
  source_domain text not null,
  source_url text unique not null,
  scraped_at timestamptz default now(),
  is_active boolean default true
);
create index if not exists idx_opportunities_source on opportunities(source_domain);
create index if not exists idx_opportunities_sectors on opportunities using gin(sectors);
create index if not exists idx_opportunities_country on opportunities(country);

-- Table 3: subscriptions
create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  email text,
  telegram_id text,
  sectors_filter text[] default '{}',
  donor_filter text[] default '{}',
  country_filter text[] default '{}',
  channel text check (channel in ('telegram', 'email', 'both')) default 'both',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Table 4: cv_scores
create table if not exists cv_scores (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id),
  overall_score integer,
  dimensions jsonb,
  improvements jsonb,
  scored_at timestamptz default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table opportunities enable row level security;
alter table subscriptions enable row level security;
alter table cv_scores enable row level security;

-- Public read for opportunities (anyone can browse)
create policy "Public read opportunities" on opportunities
  for select using (true);

-- Public insert for subscriptions (anyone can subscribe)
create policy "Public insert subscriptions" on subscriptions
  for insert with check (true);

-- Storage buckets (run separately in Supabase dashboard or via API):
-- insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false);
-- insert into storage.buckets (id, name, public) values ('formatted-docs', 'formatted-docs', false);
