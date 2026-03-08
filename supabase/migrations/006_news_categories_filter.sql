-- Add news categories filter to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS news_categories_filter TEXT[] DEFAULT '{}';
