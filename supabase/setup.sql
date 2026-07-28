-- Consistency — one-shot database setup (idempotent)
-- Paste this entire file into the Supabase SQL Editor and click Run.
-- Safe to re-run: the section below clears any previous Consistency
-- objects (tables, types, functions, triggers) before rebuilding.

-- ============================================================
-- Clean slate — remove any prior Consistency objects
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.activity_logs cascade;
drop table if exists public.sync_queue cascade;
drop table if exists public.notification_log cascade;
drop table if exists public.telegram_settings cascade;
drop table if exists public.daily_statistics cascade;
drop table if exists public.completion_logs cascade;
drop table if exists public.reminder_occurrences cascade;
drop table if exists public.reminders cascade;
drop table if exists public.time_blocks cascade;
drop table if exists public.categories cascade;
drop table if exists public.user_preferences cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_owner(uuid) cascade;

drop type if exists public.completion_action cascade;
drop type if exists public.occurrence_status cascade;
drop type if exists public.reminder_priority cascade;
-- ============================================================
-- 20260728000001_schema.sql
-- ============================================================
-- Consistency â€” initial schema
-- Every user-owned table carries: user_id (owner), created_at/updated_at
-- (LWW sync + incremental pull), and deleted_at (soft-delete tombstone so
-- deletions replicate across devices).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.reminder_priority as enum ('none', 'low', 'medium', 'high', 'urgent');
create type public.occurrence_status as enum ('pending', 'completed', 'skipped');
create type public.completion_action as enum ('completed', 'undone', 'skipped', 'unskipped', 'snoozed', 'rescheduled');

-- ---------------------------------------------------------------------------
-- profiles â€” 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url  text,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_preferences â€” 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  theme               text not null default 'system' check (theme in ('light', 'dark', 'system')),
  accent_color        text not null default 'emerald',
  week_starts_on      smallint not null default 1 check (week_starts_on between 0 and 6),
  default_calendar_view text not null default 'timeGridWeek',
  default_duration_min  integer not null default 30 check (default_duration_min between 5 and 1440),
  time_format         text not null default '24h' check (time_format in ('12h', '24h')),
  day_start_hour      smallint not null default 6 check (day_start_hour between 0 and 23),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  color       text not null default '#34d399',
  icon        text not null default 'tag',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index categories_user_updated_idx on public.categories (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- time_blocks â€” recurring day-template blocks (e.g. Gym 18:00â€“19:30 Mon/Wed)
-- ---------------------------------------------------------------------------
create table public.time_blocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '',
  icon         text not null default 'clock',
  color        text not null default '#818cf8',
  start_time   time not null,
  end_time     time not null,
  days_of_week smallint[] not null default '{1,2,3,4,5}',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index time_blocks_user_updated_idx on public.time_blocks (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- reminders â€” the series definition. Recurrence is an RFC 5545 RRULE string;
-- occurrences are expanded client-side and only materialized on interaction.
-- ---------------------------------------------------------------------------
create table public.reminders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 200),
  description          text not null default '',
  priority             public.reminder_priority not null default 'none',
  category_id          uuid references public.categories (id) on delete set null,
  time_block_id        uuid references public.time_blocks (id) on delete set null,
  color                text,
  rrule                text,                          -- null = one-time
  timezone             text not null default 'UTC',   -- IANA zone the schedule is anchored in
  start_date           date not null,                 -- first occurrence (local date)
  end_date             date,                          -- recurrence window end (local date)
  reminder_time        time,                          -- local wall-clock time; null = all-day
  duration_minutes     integer not null default 30 check (duration_minutes between 0 and 1440),
  all_day              boolean not null default false,
  notify               boolean not null default true,
  notify_minutes_before integer not null default 0 check (notify_minutes_before between 0 and 10080),
  notes                text not null default '',
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index reminders_user_updated_idx on public.reminders (user_id, updated_at);
create index reminders_user_start_idx on public.reminders (user_id, start_date) where deleted_at is null;
create index reminders_category_idx on public.reminders (category_id);
create index reminders_time_block_idx on public.reminders (time_block_id);

-- ---------------------------------------------------------------------------
-- reminder_occurrences â€” materialized state for a single instance.
-- occurrence_date is the LOCAL calendar date of the instance in the
-- reminder's timezone: stable across DST shifts.
-- ---------------------------------------------------------------------------
create table public.reminder_occurrences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  reminder_id     uuid not null references public.reminders (id) on delete cascade,
  occurrence_date date not null,
  scheduled_at    timestamptz not null,   -- resolved UTC instant of this instance
  status          public.occurrence_status not null default 'pending',
  completed_at    timestamptz,
  snoozed_until   timestamptz,
  moved_to        timestamptz,            -- per-instance reschedule (drag on calendar)
  duration_minutes integer,               -- per-instance duration override (resize)
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (reminder_id, occurrence_date)
);

create index occurrences_user_updated_idx on public.reminder_occurrences (user_id, updated_at);
create index occurrences_user_date_idx on public.reminder_occurrences (user_id, occurrence_date) where deleted_at is null;
create index occurrences_reminder_idx on public.reminder_occurrences (reminder_id, occurrence_date);

-- ---------------------------------------------------------------------------
-- completion_logs â€” append-only audit trail feeding the activity feed
-- ---------------------------------------------------------------------------
create table public.completion_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  reminder_id     uuid not null references public.reminders (id) on delete cascade,
  occurrence_date date not null,
  action          public.completion_action not null,
  acted_at        timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index completion_logs_user_acted_idx on public.completion_logs (user_id, acted_at desc);
create index completion_logs_user_updated_idx on public.completion_logs (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- daily_statistics â€” one row per user per local date; the heatmap/streak/
-- trends source. Recomputed client-side per affected date, upserted.
-- ---------------------------------------------------------------------------
create table public.daily_statistics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  date            date not null,
  due_count       integer not null default 0,
  completed_count integer not null default 0,
  skipped_count   integer not null default 0,
  score           numeric(4, 3) not null default 0 check (score between 0 and 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (user_id, date)
);

create index daily_statistics_user_updated_idx on public.daily_statistics (user_id, updated_at);
create index daily_statistics_user_date_idx on public.daily_statistics (user_id, date desc);

-- ---------------------------------------------------------------------------
-- telegram_settings â€” per-user bot credentials + notification preferences.
-- The token is the user's OWN bot token; RLS restricts it to its owner and it
-- is only ever read by the owner and the service-role dispatch function.
-- ---------------------------------------------------------------------------
create table public.telegram_settings (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  bot_token            text not null default '',
  chat_id              text not null default '',
  enabled              boolean not null default false,
  notify_reminders     boolean not null default true,
  notify_completions   boolean not null default false,
  notify_missed        boolean not null default true,
  morning_agenda       boolean not null default false,
  morning_agenda_time  time not null default '07:30',
  evening_summary      boolean not null default false,
  evening_summary_time time not null default '21:00',
  weekly_progress      boolean not null default false,
  weekly_progress_day  smallint not null default 0 check (weekly_progress_day between 0 and 6),
  last_test_at         timestamptz,
  last_test_ok         boolean,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notification_log â€” dedupe ledger for the dispatch function (one send per
-- occurrence/kind) + delivery status for debugging.
-- ---------------------------------------------------------------------------
create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,             -- reminder | morning_agenda | evening_summary | missed | weekly
  dedupe_key  text not null,             -- e.g. "reminder:<id>:<date>"
  sent_at     timestamptz not null default now(),
  ok          boolean not null,
  detail      text not null default '',
  unique (user_id, dedupe_key)
);

create index notification_log_user_sent_idx on public.notification_log (user_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- sync_queue â€” server-side dead-letter queue: clients report pushes that
-- permanently failed so they are visible/debuggable rather than silently lost.
-- ---------------------------------------------------------------------------
create table public.sync_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  device_id  text not null,
  table_name text not null,
  op         text not null check (op in ('upsert', 'delete')),
  payload    jsonb not null,
  error      text not null default '',
  created_at timestamptz not null default now()
);

create index sync_queue_user_idx on public.sync_queue (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- activity_logs â€” recent-activity feed
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null,
  message    text not null,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index activity_logs_user_created_idx on public.activity_logs (user_id, created_at desc);
create index activity_logs_user_updated_idx on public.activity_logs (user_id, updated_at);

-- ============================================================
-- 20260728000002_rls.sql
-- ============================================================
-- Row Level Security: every table is owner-only. The anon key is useless
-- without a valid session; service_role (edge functions) bypasses RLS.

-- Helper to keep policies terse and consistent.
create or replace function public.is_owner(row_user_id uuid)
returns boolean
language sql
stable
as $$
  select row_user_id = (select auth.uid())
$$;

-- profiles (keyed by id, not user_id)
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles for select using (id = (select auth.uid()));
create policy "profiles_insert" on public.profiles for insert with check (id = (select auth.uid()));
create policy "profiles_update" on public.profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles_delete" on public.profiles for delete using (id = (select auth.uid()));

-- All user_id-keyed tables share identical policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_preferences',
    'categories',
    'time_blocks',
    'reminders',
    'reminder_occurrences',
    'completion_logs',
    'daily_statistics',
    'telegram_settings',
    'notification_log',
    'sync_queue',
    'activity_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_owner(user_id))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.is_owner(user_id))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (public.is_owner(user_id)) with check (public.is_owner(user_id))',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (public.is_owner(user_id))',
      t || '_delete', t
    );
  end loop;
end;
$$;

-- ============================================================
-- 20260728000003_triggers.sql
-- ============================================================
-- updated_at maintenance + new-user bootstrap.

-- Server-authoritative updated_at: last-write-wins conflict resolution depends
-- on this being set by the database, not by (possibly skewed) client clocks.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'user_preferences',
    'categories',
    'time_blocks',
    'reminders',
    'reminder_occurrences',
    'completion_logs',
    'daily_statistics',
    'telegram_settings',
    'activity_logs'
  ]
  loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- Bootstrap profile + preferences + starter categories for new signups.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
  );

  insert into public.user_preferences (user_id) values (new.id);

  insert into public.categories (user_id, name, color, icon, sort_order)
  values
    (new.id, 'Personal', '#34d399', 'user',      0),
    (new.id, 'Work',     '#60a5fa', 'briefcase', 1),
    (new.id, 'Health',   '#f472b6', 'heart',     2),
    (new.id, 'Learning', '#a78bfa', 'book-open', 3);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 20260728000004_realtime.sql
-- ============================================================
-- Realtime: broadcast row changes for the tables devices need to observe.
-- (RLS applies to realtime too â€” users only receive their own rows.)

alter publication supabase_realtime add table public.reminders;
alter publication supabase_realtime add table public.reminder_occurrences;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.time_blocks;
alter publication supabase_realtime add table public.daily_statistics;
alter publication supabase_realtime add table public.completion_logs;
alter publication supabase_realtime add table public.activity_logs;
alter publication supabase_realtime add table public.user_preferences;

-- Full row images so deletes/updates carry enough data for client-side merge.
alter table public.reminders replica identity full;
alter table public.reminder_occurrences replica identity full;
alter table public.categories replica identity full;
alter table public.time_blocks replica identity full;
alter table public.daily_statistics replica identity full;


