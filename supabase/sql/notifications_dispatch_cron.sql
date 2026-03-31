-- Schedule notifications-dispatch every 15 minutes.
-- Replace placeholders before running:
--   YOUR_PROJECT_REF
--   YOUR_SUPABASE_ANON_KEY

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'notifications_dispatch_every_15_min';
exception
  when undefined_table then
    null;
end $$;

select
  cron.schedule(
    'notifications_dispatch_every_15_min',
    '*/15 * * * *',
    $$
    select
      net.http_post(
        url := 'https://YOUR_PROJECT_REF.functions.supabase.co/notifications-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_SUPABASE_ANON_KEY'
        ),
        body := '{}'::jsonb
      ) as request_id;
    $$
  );

