create table if not exists public.recruiting_agent_discrepancy_archives (
  owner_key text not null,
  alert_key text not null,
  archived_at timestamptz not null default now(),
  primary key (owner_key, alert_key)
);

alter table public.recruiting_agent_discrepancy_archives enable row level security;

drop policy if exists "recruiting discrepancy archives owner"
on public.recruiting_agent_discrepancy_archives;

create policy "recruiting discrepancy archives owner"
on public.recruiting_agent_discrepancy_archives
for all
to anon, authenticated
using (
  coalesce(
    (current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner'),
    ''
  ) = owner_key
)
with check (
  coalesce(
    (current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner'),
    ''
  ) = owner_key
);

grant select, insert, update, delete
on public.recruiting_agent_discrepancy_archives
to anon, authenticated;
