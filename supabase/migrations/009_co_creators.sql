-- Devidends Co-Creators — founding member/contributor circle

create table if not exists co_creators (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  invite_token text unique not null,
  member_number integer unique,
  invited_at timestamptz default now(),
  invited_by text default 'mussie',
  joined_at timestamptz,
  status text default 'invited' check (status in ('invited','joined','declined','opted_out')),

  -- Identity (prefilled from invite, editable on form)
  name text not null,
  email text,
  whatsapp_number text,
  linkedin_url text,
  role_title text,
  years_in_sector integer,

  -- Channel preferences
  preferred_channel text check (preferred_channel in ('whatsapp','email','telegram')),
  ask_frequency text check (ask_frequency in ('weekly','biweekly','monthly','on_demand')),

  -- What they want from it
  preferred_sectors text[] default '{}',
  regions text[] default '{}',
  interests text[] default '{}',
  network_size text,
  sharing_channels text[] default '{}',
  suggested_invites text,

  -- Meta
  notes text,
  consent_granted_at timestamptz,
  opt_out_at timestamptz,
  cv_claim_requested boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_co_creators_token on co_creators(invite_token);
create index if not exists idx_co_creators_status on co_creators(status);
create index if not exists idx_co_creators_profile on co_creators(profile_id);

create table if not exists co_creator_interactions (
  id uuid primary key default gen_random_uuid(),
  co_creator_id uuid references co_creators(id) on delete cascade,
  direction text check (direction in ('outbound','inbound')),
  interaction_type text,
  channel text check (channel in ('whatsapp','email','telegram','web')),
  content text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_cc_interactions_member on co_creator_interactions(co_creator_id, created_at desc);
