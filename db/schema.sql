-- Uma's Block Planner — the only table.
--
-- The block calendar, lacrosse and piano are NOT in here. They are derived in
-- lib/schedule.ts from the school's published calendar, so a holiday removes
-- practice on its own. This table holds only what Uma adds herself.

create table if not exists events (
  id           text primary key,
  title        text not null check (length(title) between 1 and 200),
  cat          text not null check (cat in
                 ('lax','piano','math','act','study','social','email','school','other')),

  -- A one-off happens on event_date. A weekly event starts on it.
  event_date   date not null,
  start_time   time not null,
  end_time     time not null,

  loc          text not null default '' check (length(loc) <= 200),
  notes        text not null default '' check (length(notes) <= 2000),

  repeat_mode  text not null default 'none' check (repeat_mode in ('none','weekly')),
  days         smallint[] not null default '{}',   -- 0 = Sunday
  until_date   date,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint ends_after_it_starts check (end_time > start_time),
  constraint weekly_has_days check (repeat_mode = 'none' or array_length(days, 1) >= 1)
);

create index if not exists events_date_idx on events (event_date);
