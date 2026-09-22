drop policy if exists "allow_select_admin_users" on public.admin_users;
drop policy if exists "allow_update_admin_users" on public.admin_users;

drop policy if exists "app settings public read" on public.app_settings;
create policy "app settings public read"
on public.app_settings
for select
to anon, authenticated
using (
  key = any (
    array[
      'monthlyRows',
      'dispCpRows',
      'energyOffers',
      'gasOffers',
      'gasAcciseSettings',
      'punPsvRows'
    ]::text[]
  )
);
