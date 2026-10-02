alter table public.recruiting_candidates
  add column if not exists is_favorite boolean not null default false;
