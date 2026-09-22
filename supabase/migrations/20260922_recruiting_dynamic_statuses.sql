alter table public.recruiting_candidates
  drop constraint if exists recruiting_candidates_contact_status_check;

create table if not exists public.recruiting_statuses (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  code text not null,
  label text not null,
  color_key text not null default 'slate',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recruiting_statuses_owner_code_uidx
  on public.recruiting_statuses(owner_key, code);

create index if not exists recruiting_statuses_owner_sort_idx
  on public.recruiting_statuses(owner_key, sort_order, label);

alter table public.recruiting_statuses enable row level security;

grant select, insert, update, delete
  on public.recruiting_statuses
  to anon, authenticated;

drop policy if exists "recruiting statuses owner"
  on public.recruiting_statuses;

create policy "recruiting statuses owner"
on public.recruiting_statuses
for all
to anon, authenticated
using (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key
)
with check (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner', '') = owner_key
);
