alter table public.recruiting_candidates
  add column if not exists company_name text not null default '';

update public.recruiting_candidates
set full_name = upper(trim(full_name))
where full_name is not null
  and full_name <> upper(trim(full_name));

create index if not exists recruiting_candidates_company_idx
on public.recruiting_candidates(owner_key, company_name);
