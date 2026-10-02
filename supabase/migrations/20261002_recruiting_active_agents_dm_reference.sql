alter table public.recruiting_active_agents
  add column if not exists dm_reference text not null default '';

update public.recruiting_active_agents
set dm_reference = coalesce(
  nullif(btrim(dm_reference), ''),
  nullif(btrim(dm1), ''),
  nullif(btrim(dm2), ''),
  ''
)
where coalesce(dm_reference, '') = '';
