alter table public.recruiting_hr_email_internal_config
  add column if not exists recipient_email text;

update public.recruiting_hr_email_internal_config
set recipient_email = 'alessio.cedroni@piuenergia.it',
    updated_at = now()
where id = 1;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'recruiting-hr-email-hourly'),
  schedule := '*/30 * * * *'
);
