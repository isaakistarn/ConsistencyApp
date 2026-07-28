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
