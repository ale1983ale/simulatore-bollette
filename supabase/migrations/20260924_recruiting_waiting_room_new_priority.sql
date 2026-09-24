alter table public.recruiting_candidates
  add column if not exists waiting_room_new boolean not null default false;

create index if not exists recruiting_candidates_waiting_room_new_idx
  on public.recruiting_candidates(owner_key, waiting_room_new, created_at desc);

create or replace function public.recruiting_accept_incoming_candidate(p_incoming_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner text := coalesce(
    (current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner'),
    ''
  );
  v_incoming public.recruiting_hr_incoming_candidates%rowtype;
  v_candidate_id uuid;
begin
  if v_owner = '' then
    raise exception 'Owner non disponibile';
  end if;

  select *
    into v_incoming
  from public.recruiting_hr_incoming_candidates
  where id = p_incoming_id
    and owner_key = v_owner
  for update;

  if not found then
    raise exception 'Nominativo in arrivo non trovato';
  end if;

  if v_incoming.status = 'accepted'
     and v_incoming.accepted_candidate_id is not null then
    return v_incoming.accepted_candidate_id;
  end if;

  if v_incoming.status <> 'pending' then
    raise exception 'Il nominativo non è più in attesa';
  end if;

  insert into public.recruiting_candidates (
    owner_key,
    contact_scope,
    full_name,
    operational_zone,
    province_code,
    region,
    sector_energy,
    sector_other,
    company_name,
    phone,
    email,
    contact_status,
    latitude,
    longitude,
    waiting_room_new,
    created_at,
    updated_at
  )
  values (
    v_owner,
    'internal',
    upper(v_incoming.full_name),
    upper(v_incoming.operational_zone),
    upper(v_incoming.province_code),
    v_incoming.region,
    v_incoming.sector_energy,
    v_incoming.sector_other,
    v_incoming.company_name,
    v_incoming.phone,
    v_incoming.email,
    'DA_CHIAMARE',
    v_incoming.latitude,
    v_incoming.longitude,
    true,
    now(),
    now()
  )
  returning id into v_candidate_id;

  insert into public.recruiting_notes (
    owner_key,
    candidate_id,
    note_date,
    note_text,
    called_by_me,
    hr_sync_pending,
    created_at
  )
  select
    v_owner,
    v_candidate_id,
    n.note_date,
    n.note_text,
    false,
    false,
    n.created_at
  from public.recruiting_hr_incoming_notes n
  where n.incoming_candidate_id = p_incoming_id
    and n.owner_key = v_owner
  order by n.note_date asc, n.created_at asc;

  update public.recruiting_hr_incoming_candidates
  set
    status = 'accepted',
    accepted_candidate_id = v_candidate_id,
    decided_at = now()
  where id = p_incoming_id
    and owner_key = v_owner;

  return v_candidate_id;
end;
$function$;
