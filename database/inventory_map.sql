-- Inventory map — run this ONCE in Supabase: Dashboard → SQL Editor → New query → Run.
-- Adds a place for each property's inventory / site development map image.
alter table properties add column if not exists inventory_map_url text;
