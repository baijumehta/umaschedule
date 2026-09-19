-- Uma's Block Planner — the only table.
--
-- The block calendar, class schedule, lacrosse and piano are NOT in here. They
-- are derived in lib/schedule.ts and lib/classes.ts from the school's published
-- calendar, so a holiday removes practice on its own. This table holds only
-- what Uma adds herself: tutoring, study time, social plans, tests, projects.
--
-- Safe to re-run. Creating the table and each later column are both guarded,
-- so this file doubles as the migration for an existing database.

create table if not exists events (
  id           text primary key,
  title        text not null check (length(title) between 1 and 200),
  cat          text not null,

  -- A one-off happens on event_date. A weekly event starts on it.
  event_date   date not null,
  start_time   time,
  end_time     time,

  loc          text not null default '' check (length(loc) <= 200),
  notes        text not null default '' check (length(notes) <= 2000),

  repeat_mode  text not null default 'none' check (repeat_mode in ('none','weekly')),
  days         smallint[] not null default '{}',   -- 0 = Sunday
  until_date   date,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint weekly_has_days check (repeat_mode = 'none' or array_length(days, 1) >= 1)
);

-- A test or a project deadline occupies a day rather than a slot in it, and
-- names the course it belongs to.
alter table events add column if not exists all_day  boolean not null default false;
alter table events add column if not exists class_id text    not null default '';

-- Older databases created these NOT NULL, before all-day items existed.
alter table events alter column start_time drop not null;
alter table events alter column end_time   drop not null;

-- Constraints have no "if not exists", so drop and recreate to stay re-runnable.
alter table events drop constraint if exists ends_after_it_starts;
alter table events add  constraint ends_after_it_starts
  check (all_day or (start_time is not null and end_time is not null and end_time > start_time));

-- The first version of this table declared the category check inline, so
-- Postgres named it events_cat_check. "create table if not exists" skips an
-- existing table, so that constraint outlives any edit to the block above and
-- has to be dropped by its generated name or it keeps rejecting new categories.
alter table events drop constraint if exists events_cat_check;

alter table events drop constraint if exists known_category;
alter table events add  constraint known_category check (cat in
  ('lax','piano','math','act','study','social','test','project','email','school','other'));

create index if not exists events_date_idx on events (event_date);

-- ---------------------------------------------------------------------------
-- Who gets the nightly text.
--
-- Phone numbers are entered in the app, never committed. E.164 only, which is
-- what Twilio accepts.
create table if not exists recipients (
  id          text primary key,
  name        text not null check (length(name) between 1 and 60),
  phone       text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists recipients_phone_idx on recipients (phone);

-- One row per person per day the text went out, so a retry or a manual run
-- cannot text anyone twice for the same day.
create table if not exists sms_log (
  send_date   date not null,
  phone       text not null,
  sent_at     timestamptz not null default now(),
  ok          boolean not null,
  detail      text not null default '',
  primary key (send_date, phone)
);
