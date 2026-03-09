-- Add news_sectors_filter column for sector-based news filtering
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS news_sectors_filter TEXT[] DEFAULT '{}';
