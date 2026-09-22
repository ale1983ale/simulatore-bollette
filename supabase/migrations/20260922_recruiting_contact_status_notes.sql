
alter table public.recruiting_candidates
  add column if not exists contact_status text not null default 'DA_CHIAMARE';

alter table public.recruiting_notes
  add column if not exists called_by_me boolean not null default false;

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
      'KO',
      'DA_RISENTIRE'
    )
  );

create index if not exists recruiting_candidates_status_idx
on public.recruiting_candidates(owner_key, contact_status);
