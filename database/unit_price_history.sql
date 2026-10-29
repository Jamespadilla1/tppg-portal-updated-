-- Unit price history: one row each time a unit's TCP is set or changed (run once in the Supabase SQL editor).
-- History starts from when this is run; earlier price changes were never recorded.
create table if not exists unit_price_history (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null,
  old_tcp numeric,          -- empty for the first price, when the unit was listed
  new_tcp numeric not null,
  changed_at timestamptz not null default now()
);
create index if not exists unit_price_history_unit_idx on unit_price_history (unit_id, changed_at desc);
