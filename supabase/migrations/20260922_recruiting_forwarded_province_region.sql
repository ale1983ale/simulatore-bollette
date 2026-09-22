alter table public.recruiting_candidates
  add column if not exists forwarded_to text not null default '',
  add column if not exists province_code text not null default '',
  add column if not exists region text not null default '';

alter table public.recruiting_candidates
  drop constraint if exists recruiting_candidates_contact_status_check;

alter table public.recruiting_candidates
  add constraint recruiting_candidates_contact_status_check
  check (
    contact_status in (
      'CHIAMATO',
      'DA_CHIAMARE',
      'INVIATO_MANDATO',
      'FISSATO_APPUNTAMENTO',
      'FISSATA_VIDEOCALL',
      'FIRMATO_MANDATO',
      'INOLTRATO_A',
      'KO',
      'DA_RISENTIRE'
    )
  );

create index if not exists recruiting_candidates_forwarded_to_idx
  on public.recruiting_candidates(owner_key, forwarded_to);

create index if not exists recruiting_candidates_province_idx
  on public.recruiting_candidates(owner_key, province_code);

create index if not exists recruiting_candidates_region_idx
  on public.recruiting_candidates(owner_key, region);
