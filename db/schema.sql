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
-- Who gets the nightly briefing, and how it reaches them.
--
-- A person can have a phone, an email, or both — email carries it while Twilio
-- registration is still clearing, and the same row keeps working afterwards.
-- Addresses are entered in the app, never committed.
create table if not exists recipients (
  id          text primary key,
  name        text not null check (length(name) between 1 and 60),
  phone       text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table recipients add column if not exists email text not null default '';
alter table recipients alter column phone set default '';

-- The original table required a phone in E.164 under a generated name. Email-
-- only recipients need that relaxed, so drop it by that name and re-add one
-- that also admits an empty string.
alter table recipients drop constraint if exists recipients_phone_check;
alter table recipients drop constraint if exists phone_shape;
alter table recipients add  constraint phone_shape
  check (phone = '' or phone ~ '^\+[1-9][0-9]{7,14}$');

alter table recipients drop constraint if exists email_shape;
alter table recipients add  constraint email_shape
  check (email = '' or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

alter table recipients drop constraint if exists has_an_address;
alter table recipients add  constraint has_an_address check (phone <> '' or email <> '');

-- Partial, so several email-only people can share the empty phone string.
drop index if exists recipients_phone_idx;
create unique index if not exists recipients_phone_uniq on recipients (phone) where phone <> '';
create unique index if not exists recipients_email_uniq on recipients (lower(email)) where email <> '';

-- One row per person per channel per day, so a retry or a manual run cannot
-- send anyone the same briefing twice. Replaces sms_log, which was SMS-only.
create table if not exists send_log (
  send_date   date not null,
  channel     text not null check (channel in ('sms','email')),
  address     text not null,
  sent_at     timestamptz not null default now(),
  ok          boolean not null,
  detail      text not null default '',
  primary key (send_date, channel, address)
);

drop table if exists sms_log;

-- A nudge that has been dealt with. Ids are deterministic (rule + event + step)
-- so ticking one off keeps it down without deleting the event it came from.
create table if not exists nudge_state (
  id       text primary key,
  done_at  timestamptz not null default now()
);

-- Which occurrences she is NOT attending.
--
-- Keyed on the occurrence id, not the event id, so it works for the derived
-- half of the schedule too: "lax-2026-09-21" skips one practice without
-- touching the rule that generates practice, and a weekly tutoring slot can
-- lose a single week. attending=false is the interesting row; a true row is
-- an explicit "yes I am going", which resolves a clash the other way.
create table if not exists attendance (
  occurrence_id text primary key,
  attending     boolean not null,
  note          text not null default '' check (length(note) <= 200),
  decided_at    timestamptz not null default now()
);
