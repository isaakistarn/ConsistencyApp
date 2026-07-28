-- Realtime: broadcast row changes for the tables devices need to observe.
-- (RLS applies to realtime too — users only receive their own rows.)

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
