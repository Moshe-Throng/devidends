-- Web login tokens — short-lived tokens the user exchanges via Telegram bot
-- to establish a web session without phone/email/password.
create table if not exists login_tokens (
  token text primary key,
  telegram_id text,
  telegram_username text,
  user_id uuid,
  email text,
  magic_token_hash text,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '5 minutes'),
  used_at timestamptz
);

create index if not exists idx_login_tokens_expires on login_tokens(expires_at);

alter table login_tokens enable row level security;
-- Service role bypasses RLS — client never reads this table directly.
