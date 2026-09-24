create or replace function public.recruiting_delete_candidate(
  p_candidate_id uuid,
  p_allow_reimport boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner text := coalesce(
    (current_setting('request.headers', true)::jsonb ->> 'x-recruiting-owner'),
    ''
  );
  v_candidate_name text;
  v_incoming_id uuid;
  v_source_system text;
  v_source_candidate_id text;
begin
  if v_owner = '' then
    raise exception 'Owner non disponibile';
  end if;

  select full_name
    into v_candidate_name
  from public.recruiting_candidates
  where id = p_candidate_id
    and owner_key = v_owner
  for update;

  if not found then
    raise exception 'Contatto non trovato';
  end if;

  select id, source_system, source_candidate_id
    into v_incoming_id, v_source_system, v_source_candidate_id
  from public.recruiting_hr_incoming_candidates
  where owner_key = v_owner
    and accepted_candidate_id = p_candidate_id
  order by decided_at desc nulls last, received_at desc
  limit 1;

  delete from public.recruiting_candidates
  where id = p_candidate_id
    and owner_key = v_owner;

  if p_allow_reimport and v_incoming_id is not null then
    delete from public.recruiting_hr_incoming_candidates
    where id = v_incoming_id
      and owner_key = v_owner;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'candidate_name', coalesce(v_candidate_name, ''),
    'allow_reimport', p_allow_reimport,
    'reimport_enabled',
      p_allow_reimport and v_incoming_id is not null,
    'source_system', coalesce(v_source_system, ''),
    'source_candidate_id', coalesce(v_source_candidate_id, '')
  );
end;
$function$;
