create extension if not exists pgcrypto;

create table if not exists public.saved_simulations (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  simulation_type text not null check (simulation_type in ('energy','gas')),
  name text not null check (length(trim(name)) > 0),
  state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_simulations_owner_type_created_idx
  on public.saved_simulations (owner_key, simulation_type, created_at desc);

alter table public.saved_simulations enable row level security;

grant select, insert, delete on table public.saved_simulations to anon;

create policy "saved simulations select"
on public.saved_simulations
for select
to anon
using (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-client-info', '')
  = 'simulation-save-sync-' || owner_key
);

create policy "saved simulations insert"
on public.saved_simulations
for insert
to anon
with check (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-client-info', '')
  = 'simulation-save-sync-' || owner_key
);

create policy "saved simulations delete"
on public.saved_simulations
for delete
to anon
using (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-client-info', '')
  = 'simulation-save-sync-' || owner_key
);

create or replace function public.trim_saved_simulations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.saved_simulations
  where id in (
    select id
    from public.saved_simulations
    where owner_key = new.owner_key
      and simulation_type = new.simulation_type
    order by created_at desc, id desc
    offset 100
  );

  return new;
end;
$$;

create trigger saved_simulations_keep_latest_100
after insert on public.saved_simulations
for each row
execute function public.trim_saved_simulations();
