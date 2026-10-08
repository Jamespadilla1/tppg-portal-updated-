-- ─────────────────────────────────────────────────────────────────────────────
-- Calendar feature — run this ONCE in Supabase: Dashboard → SQL Editor → New query → Run.
-- Creates the two tables the calendar needs. Commission release dates, reservation
-- dates and promo end dates are NOT stored here: they are read live from the
-- existing commission_receivables, buyers and promotions tables.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists calendar_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  event_type       text not null default 'other'
                   check (event_type in ('tripping','client_meeting','team_meeting','training','personal','other')),
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  all_day          boolean not null default false,
  location         text,
  notes            text,
  visibility       text not null default 'private'
                   check (visibility in ('private','team','public')),
  created_by_id    text not null,
  created_by_role  text not null
                   check (created_by_role in ('admin','unit_manager','sales_manager','team_leader','agent')),
  created_by_name  text,
  cancelled        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint calendar_events_end_after_start check (end_at >= start_at)
);

create index if not exists calendar_events_range_idx   on calendar_events (start_at, end_at);
create index if not exists calendar_events_creator_idx on calendar_events (created_by_role, created_by_id);

-- Required attendees of an event (only Admin, Unit/Sales Managers and Team Leaders can add them)
create table if not exists calendar_event_attendees (
  event_id     uuid not null references calendar_events(id) on delete cascade,
  person_id    text not null,
  person_role  text not null
               check (person_role in ('admin','unit_manager','sales_manager','team_leader','agent')),
  primary key (event_id, person_role, person_id)
);

create index if not exists calendar_attendees_person_idx on calendar_event_attendees (person_role, person_id);
