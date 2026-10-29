-- Promotions: optional start time (run once in the Supabase SQL editor).
-- Empty = the promotion is live as soon as it is saved, so existing promotions are unaffected.
alter table promotions add column if not exists starts_at timestamptz;
