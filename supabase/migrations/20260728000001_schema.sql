-- Consistency — initial schema
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
-- profiles — 1:1 with auth.users
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
-- user_preferences — 1:1 with auth.users
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
-- time_blocks — recurring day-template blocks (e.g. Gym 18:00–19:30 Mon/Wed)
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
-- reminders — the series definition. Recurrence is an RFC 5545 RRULE string;
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
-- reminder_occurrences — materialized state for a single instance.
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
-- completion_logs — append-only audit trail feeding the activity feed
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
-- daily_statistics — one row per user per local date; the heatmap/streak/
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
-- telegram_settings — per-user bot credentials + notification preferences.
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
-- notification_log — dedupe ledger for the dispatch function (one send per
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
-- sync_queue — server-side dead-letter queue: clients report pushes that
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
-- activity_logs — recent-activity feed
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
