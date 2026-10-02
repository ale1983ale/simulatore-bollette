alter table public.recruiting_active_agents
  add column if not exists dm1 text not null default '',
  add column if not exists dm2 text not null default '';
