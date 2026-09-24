alter table public.admin_users
  add column if not exists full_access boolean not null default true;

update public.admin_users
set full_access = true
where role = 'super_admin'
  and full_access is distinct from true;

create or replace function public.admin_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin public.admin_users%rowtype;
  v_token text;
  v_token_hash text;
  v_password_ok boolean := false;
begin
  select * into v_admin
  from public.admin_users
  where lower(coalesce(username, '')) = lower(trim(coalesce(p_username, '')))
  limit 1;

  if v_admin.id is null then return null; end if;

  if coalesce(v_admin.password, '') like '$2%' then
    v_password_ok := extensions.crypt(coalesce(p_password, ''), v_admin.password) = v_admin.password;
  else
    v_password_ok := coalesce(v_admin.password, '') = coalesce(p_password, '');
  end if;

  if not v_password_ok then return null; end if;

  delete from public.admin_sessions where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.admin_sessions(token_hash, admin_id)
  values (v_token_hash, v_admin.id);

  return jsonb_build_object(
    'token', v_token,
    'id', v_admin.id,
    'auth_id', v_admin.auth_id,
    'nome', v_admin.nome,
    'cognome', v_admin.cognome,
    'email', v_admin.email,
    'username', v_admin.username,
    'role', v_admin.role,
    'full_access', case when v_admin.role = 'super_admin' then true else coalesce(v_admin.full_access, true) end
  );
end;
$function$;

create or replace function public.admin_session_profile(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin_id bigint;
  v_admin public.admin_users%rowtype;
begin
  v_admin_id := private.admin_session_user(p_session_token, false);

  select * into v_admin
  from public.admin_users
  where id = v_admin_id;

  return jsonb_build_object(
    'id', v_admin.id,
    'auth_id', v_admin.auth_id,
    'nome', v_admin.nome,
    'cognome', v_admin.cognome,
    'email', v_admin.email,
    'username', v_admin.username,
    'role', v_admin.role,
    'full_access', case when v_admin.role = 'super_admin' then true else coalesce(v_admin.full_access, true) end
  );
end;
$function$;

create or replace function public.admin_list_users(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_requester bigint;
  v_result jsonb;
begin
  v_requester := private.admin_session_user(p_session_token, true);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'auth_id', a.auth_id,
        'nome', a.nome,
        'cognome', a.cognome,
        'email', a.email,
        'username', a.username,
        'role', a.role,
        'full_access', case when a.role = 'super_admin' then true else coalesce(a.full_access, true) end
      )
      order by coalesce(a.nome, ''), coalesce(a.cognome, ''), coalesce(a.username, '')
    ),
    '[]'::jsonb
  )
  into v_result
  from public.admin_users a;

  return v_result;
end;
$function$;

create or replace function public.admin_set_full_access(
  p_session_token text,
  p_admin_id bigint,
  p_full_access boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_requester bigint;
  v_row public.admin_users%rowtype;
begin
  v_requester := private.admin_session_user(p_session_token, true);

  update public.admin_users
  set full_access = case
    when role = 'super_admin' then true
    else coalesce(p_full_access, false)
  end
  where id = p_admin_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Admin non trovato';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'role', v_row.role,
    'full_access', case when v_row.role = 'super_admin' then true else coalesce(v_row.full_access, true) end
  );
end;
$function$;
