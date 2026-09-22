create unique index if not exists admin_users_username_lower_uidx
on public.admin_users (lower(username));

update public.admin_users
set password = extensions.crypt(password, extensions.gen_salt('bf', 12))
where coalesce(password, '') <> ''
  and password not like '$2%';

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from public, anon, authenticated;
grant select on table public.app_settings to anon, authenticated;

drop policy if exists "app settings public read" on public.app_settings;
create policy "app settings public read"
on public.app_settings
for select
to anon, authenticated
using (true);
