create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.checkin_reminder_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  coach_id uuid,
  email_type text not null check (email_type in ('d1','d0','d2')),
  reference_date date not null default current_date,
  days_since_feedback integer,
  variant_index integer,
  created_at timestamptz not null default now(),
  constraint checkin_reminder_log_unique unique (student_id, email_type, reference_date)
);

create index if not exists checkin_reminder_log_student_idx
  on public.checkin_reminder_log(student_id);

alter table public.checkin_reminder_log enable row level security;

drop policy if exists "Admin le o log de lembretes de checkin" on public.checkin_reminder_log;
create policy "Admin le o log de lembretes de checkin"
  on public.checkin_reminder_log
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.checkin_reminder_log to authenticated;
grant all on public.checkin_reminder_log to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'checkin-reminder-emails-daily') then
    perform cron.unschedule('checkin-reminder-emails-daily');
  end if;
end $$;

select cron.schedule(
  'checkin-reminder-emails-daily',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://firqzdnmwfhcbykixxbu.supabase.co/functions/v1/checkin-reminder-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_checkin_secret' limit 1),
        ''
      )
    ),
    body := jsonb_build_object('trigger', 'pg_cron', 'ts', now()),
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);