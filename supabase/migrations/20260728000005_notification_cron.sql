-- Scheduled Telegram dispatch: pg_cron invokes the notification-dispatch edge
-- function every minute via pg_net. The function computes what is due per user
-- (in each user's timezone) and sends via the Telegram Bot API.
--
-- SETUP REQUIRED after `supabase db push` / migration apply:
--   1. Deploy functions:  supabase functions deploy telegram-send notification-dispatch
--   2. Store secrets for the cron call (SQL editor, once):
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<service-role-key>', 'service_role_key');
--   (The service role key never leaves the database/edge runtime.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_notification_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if project_url is null or service_key is null then
    raise notice 'notification dispatch skipped: vault secrets project_url / service_role_key not set';
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/notification-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- Every minute. The dispatch function itself is idempotent (notification_log
-- dedupe), so overlapping or repeated runs are harmless.
select cron.schedule(
  'notification-dispatch-every-minute',
  '* * * * *',
  $$select public.invoke_notification_dispatch()$$
);
