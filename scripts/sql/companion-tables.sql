-- Companion Engine tables
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bfjgtqqvootfpyxkriqb/sql/new

-- 1. Drip messages — tracks all bot↔user conversation + proactive outreach
CREATE TABLE IF NOT EXISTS drip_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL,       -- 'conversation', 'share_ask', 'proactive_jobs', 'proactive_cv_tip', etc.
  user_reply TEXT,                  -- what the user said (null for proactive messages)
  trigger_type TEXT,                -- 'free_text', 'new_matching_jobs', 'cv_not_scored', 'low_cv_score'
  context JSONB DEFAULT '{}',       -- bot_message text, matched jobs, etc.
  sent_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drip_tg ON drip_messages(telegram_id);
CREATE INDEX IF NOT EXISTS idx_drip_type ON drip_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_drip_sent ON drip_messages(sent_at);

-- 2. Referral rewards — tracks feature unlocks granted via referrals
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reward_type TEXT NOT NULL,        -- 'cv_template_unlock', 'cv_compare_unlock'
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_rewards_profile ON referral_rewards(profile_id);

-- 3. Profile columns for companion engine
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_stage TEXT DEFAULT 'new';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_intent TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drip_opted_out BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now();
