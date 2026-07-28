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
