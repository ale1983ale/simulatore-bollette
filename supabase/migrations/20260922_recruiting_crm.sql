create table if not exists public.recruiting_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  full_name text not null,
  operational_zone text not null default '',
  sector_energy boolean not null default true,
  sector_other text not null default '',
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruiting_candidates_owner_idx on public.recruiting_candidates(owner_key);
create index if not exists recruiting_candidates_name_idx on public.recruiting_candidates(owner_key, full_name);
create index if not exists recruiting_candidates_zone_idx on public.recruiting_candidates(owner_key, operational_zone);

create table if not exists public.recruiting_notes (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  candidate_id uuid not null references public.recruiting_candidates(id) on delete cascade,
  note_date date not null default current_date,
  note_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists recruiting_notes_candidate_idx on public.recruiting_notes(owner_key, candidate_id, note_date desc);

create table if not exists public.recruiting_events (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  candidate_id uuid references public.recruiting_candidates(id) on delete set null,
  event_date date not null,
  event_time time,
  event_type text not null check (event_type in ('CHIAMARE','APPUNTAMENTO_ZONA','APPUNTAMENTO_SEDE','VIDEOCALL','ALTRO')),
  custom_type text not null default '',
  notes text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruiting_events_date_idx on public.recruiting_events(owner_key, event_date);
create index if not exists recruiting_events_candidate_idx on public.recruiting_events(owner_key, candidate_id);

create table if not exists public.recruiting_macroareas (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recruiting_macroareas_owner_name_uidx
on public.recruiting_macroareas(owner_key, lower(name));

create table if not exists public.recruiting_macroarea_regions (
  owner_key text not null,
  macroarea_id uuid not null references public.recruiting_macroareas(id) on delete cascade,
  region text not null,
  created_at timestamptz not null default now(),
  primary key (macroarea_id, region)
);

create index if not exists recruiting_macroarea_regions_owner_idx
on public.recruiting_macroarea_regions(owner_key, macroarea_id);

create table if not exists public.recruiting_active_agents (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  first_name text not null,
  last_name text not null,
  phone text not null default '',
  zone text not null default '',
  region text not null default '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruiting_active_agents_owner_idx on public.recruiting_active_agents(owner_key);
create index if not exists recruiting_active_agents_region_idx on public.recruiting_active_agents(owner_key, region);
create index if not exists recruiting_active_agents_zone_idx on public.recruiting_active_agents(owner_key, zone);

alter table public.recruiting_candidates enable row level security;
alter table public.recruiting_notes enable row level security;
alter table public.recruiting_events enable row level security;
alter table public.recruiting_macroareas enable row level security;
alter table public.recruiting_macroarea_regions enable row level security;
alter table public.recruiting_active_agents enable row level security;

grant select, insert, update, delete on public.recruiting_candidates to anon, authenticated;
grant select, insert, update, delete on public.recruiting_notes to anon, authenticated;
grant select, insert, update, delete on public.recruiting_events to anon, authenticated;
grant select, insert, update, delete on public.recruiting_macroareas to anon, authenticated;
grant select, insert, update, delete on public.recruiting_macroarea_regions to anon, authenticated;
grant select, insert, update, delete on public.recruiting_active_agents to anon, authenticated;

drop policy if exists "recruiting candidates owner" on public.recruiting_candidates;
create policy "recruiting candidates owner"
on public.recruiting_candidates for all to anon, authenticated
using (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key)
with check (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key);

drop policy if exists "recruiting notes owner" on public.recruiting_notes;
create policy "recruiting notes owner"
on public.recruiting_notes for all to anon, authenticated
using (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key)
with check (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key);

drop policy if exists "recruiting events owner" on public.recruiting_events;
create policy "recruiting events owner"
on public.recruiting_events for all to anon, authenticated
using (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key)
with check (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key);

drop policy if exists "recruiting macroareas owner" on public.recruiting_macroareas;
create policy "recruiting macroareas owner"
on public.recruiting_macroareas for all to anon, authenticated
using (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key)
with check (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key);

drop policy if exists "recruiting macroarea regions owner" on public.recruiting_macroarea_regions;
create policy "recruiting macroarea regions owner"
on public.recruiting_macroarea_regions for all to anon, authenticated
using (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key)
with check (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key);

drop policy if exists "recruiting active agents owner" on public.recruiting_active_agents;
create policy "recruiting active agents owner"
on public.recruiting_active_agents for all to anon, authenticated
using (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key)
with check (coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key);
