-- Cancelled sales: why it was cancelled and when (run once in the Supabase SQL editor).
-- Sales cancelled before this existed simply have no reason shown.
alter table buyers add column if not exists cancel_reason text;
alter table buyers add column if not exists cancelled_at timestamptz;
