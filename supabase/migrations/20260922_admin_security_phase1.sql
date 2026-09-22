create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.admin_sessions (
  token_hash text primary key,
  admin_id bigint not null references public.admin_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.admin_sessions enable row level security;
revoke all on table public.admin_sessions from public, anon, authenticated;

create or replace function private.admin_session_user(
  p_token text,
  p_require_super boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id bigint;
  v_role text;
  v_hash text;
begin
  if coalesce(trim(p_token), '') = '' then
    raise exception 'Sessione admin mancante';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select s.admin_id, a.role
    into v_admin_id, v_role
  from public.admin_sessions s
  join public.admin_users a on a.id = s.admin_id
  where s.token_hash = v_hash
    and s.expires_at > now()
  limit 1;

  if v_admin_id is null then
    raise exception 'Sessione admin non valida o scaduta';
  end if;

  if p_require_super and coalesce(v_role, '') <> 'super_admin' then
    raise exception 'Permessi insufficienti';
  end if;

  update public.admin_sessions
  set last_used_at = now()
  where token_hash = v_hash;

  return v_admin_id;
end;
$$;

revoke all on function private.admin_session_user(text, boolean) from public, anon, authenticated;

create or replace function public.admin_login(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.admin_users%rowtype;
  v_token text;
  v_token_hash text;
  v_password_ok boolean := false;
begin
  select *
    into v_admin
  from public.admin_users
  where lower(coalesce(username, '')) = lower(trim(coalesce(p_username, '')))
  limit 1;

  if v_admin.id is null then
    return null;
  end if;

  if coalesce(v_admin.password, '') like '$2%' then
    v_password_ok := extensions.crypt(coalesce(p_password, ''), v_admin.password) = v_admin.password;
  else
    v_password_ok := coalesce(v_admin.password, '') = coalesce(p_password, '');
  end if;

  if not v_password_ok then
    return null;
  end if;

  delete from public.admin_sessions
  where expires_at <= now();

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
    'role', v_admin.role
  );
end;
$$;

revoke all on function public.admin_login(text, text) from public;
grant execute on function public.admin_login(text, text) to anon, authenticated;

create or replace function public.admin_logout(
  p_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if coalesce(trim(p_session_token), '') = '' then
    return true;
  end if;

  v_hash := encode(extensions.digest(p_session_token, 'sha256'), 'hex');
  delete from public.admin_sessions where token_hash = v_hash;
  return true;
end;
$$;

revoke all on function public.admin_logout(text) from public;
grant execute on function public.admin_logout(text) to anon, authenticated;

create or replace function public.admin_session_profile(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_admin_id bigint;
  v_admin public.admin_users%rowtype;
begin
  v_admin_id := private.admin_session_user(p_session_token, false);

  select *
    into v_admin
  from public.admin_users
  where id = v_admin_id;

  return jsonb_build_object(
    'id', v_admin.id,
    'auth_id', v_admin.auth_id,
    'nome', v_admin.nome,
    'cognome', v_admin.cognome,
    'email', v_admin.email,
    'username', v_admin.username,
    'role', v_admin.role
  );
end;
$;

revoke all on function public.admin_session_profile(text) from public;
grant execute on function public.admin_session_profile(text) to anon, authenticated;

create or replace function public.admin_list_users(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
        'role', a.role
      )
      order by coalesce(a.nome, ''), coalesce(a.cognome, ''), coalesce(a.username, '')
    ),
    '[]'::jsonb
  )
  into v_result
  from public.admin_users a;

  return v_result;
end;
$$;

revoke all on function public.admin_list_users(text) from public;
grant execute on function public.admin_list_users(text) to anon, authenticated;

create or replace function public.admin_create_user(
  p_session_token text,
  p_nome text,
  p_cognome text,
  p_username text,
  p_password text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester bigint;
  v_row public.admin_users%rowtype;
begin
  v_requester := private.admin_session_user(p_session_token, true);

  if coalesce(trim(p_nome), '') = ''
    or coalesce(trim(p_cognome), '') = ''
    or coalesce(trim(p_username), '') = ''
    or coalesce(p_password, '') = '' then
    raise exception 'Nome, cognome, username e password sono obbligatori';
  end if;

  if exists (
    select 1
    from public.admin_users
    where lower(coalesce(username, '')) = lower(trim(p_username))
  ) then
    raise exception 'Username già esistente';
  end if;

  insert into public.admin_users(
    auth_id,
    nome,
    cognome,
    username,
    password,
    email,
    role
  )
  values (
    pg_catalog.gen_random_uuid(),
    upper(trim(p_nome)),
    upper(trim(p_cognome)),
    trim(p_username),
    extensions.crypt(p_password, extensions.gen_salt('bf', 12)),
    nullif(trim(coalesce(p_email, '')), ''),
    'admin'
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'auth_id', v_row.auth_id,
    'nome', v_row.nome,
    'cognome', v_row.cognome,
    'email', v_row.email,
    'username', v_row.username,
    'role', v_row.role
  );
end;
$$;

revoke all on function public.admin_create_user(text, text, text, text, text, text) from public;
grant execute on function public.admin_create_user(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_update_user(
  p_session_token text,
  p_admin_id bigint,
  p_nome text,
  p_cognome text,
  p_username text,
  p_password text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester bigint;
  v_row public.admin_users%rowtype;
begin
  v_requester := private.admin_session_user(p_session_token, true);

  if coalesce(trim(p_nome), '') = ''
    or coalesce(trim(p_cognome), '') = ''
    or coalesce(trim(p_username), '') = '' then
    raise exception 'Nome, cognome e username sono obbligatori';
  end if;

  if exists (
    select 1
    from public.admin_users
    where lower(coalesce(username, '')) = lower(trim(p_username))
      and id <> p_admin_id
  ) then
    raise exception 'Username già esistente';
  end if;

  update public.admin_users
  set
    nome = upper(trim(p_nome)),
    cognome = upper(trim(p_cognome)),
    username = trim(p_username),
    email = nullif(trim(coalesce(p_email, '')), ''),
    password = case
      when coalesce(p_password, '') <> '' then extensions.crypt(p_password, extensions.gen_salt('bf', 12))
      else password
    end
  where id = p_admin_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Admin non trovato';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'auth_id', v_row.auth_id,
    'nome', v_row.nome,
    'cognome', v_row.cognome,
    'email', v_row.email,
    'username', v_row.username,
    'role', v_row.role
  );
end;
$$;

revoke all on function public.admin_update_user(text, bigint, text, text, text, text, text) from public;
grant execute on function public.admin_update_user(text, bigint, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_delete_user(
  p_session_token text,
  p_admin_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester bigint;
begin
  v_requester := private.admin_session_user(p_session_token, true);

  if v_requester = p_admin_id then
    raise exception 'Non puoi eliminare l''admin con cui hai effettuato l''accesso';
  end if;

  delete from public.admin_users where id = p_admin_id;

  if not found then
    raise exception 'Admin non trovato';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_delete_user(text, bigint) from public;
grant execute on function public.admin_delete_user(text, bigint) to anon, authenticated;

create or replace function public.admin_upsert_settings(
  p_session_token text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester bigint;
  v_item jsonb;
  v_count integer := 0;
  v_key text;
begin
  v_requester := private.admin_session_user(p_session_token, true);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Impostazioni non valide';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_key := trim(coalesce(v_item->>'key', ''));
    if v_key = '' then
      raise exception 'Chiave impostazione mancante';
    end if;

    insert into public.app_settings(key, value_json, updated_at)
    values (v_key, coalesce(v_item->'value_json', 'null'::jsonb), now())
    on conflict (key) do update
    set value_json = excluded.value_json,
        updated_at = now();

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('updated', v_count);
end;
$$;

revoke all on function public.admin_upsert_settings(text, jsonb) from public;
grant execute on function public.admin_upsert_settings(text, jsonb) to anon, authenticated;
