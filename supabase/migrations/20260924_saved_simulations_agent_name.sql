alter table public.saved_simulations
  add column if not exists agent_name text;

create index if not exists saved_simulations_owner_agent_idx
  on public.saved_simulations (owner_key, agent_name)
  where agent_name is not null;
