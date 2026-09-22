create or replace function public.admin_get_setting(
  p_session_token text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $setting$
declare
  v_admin_id bigint;
  v_value jsonb;
begin
  v_admin_id := private.admin_session_user(p_session_token, false);

  select value_json
    into v_value
  from public.app_settings
  where key = trim(coalesce(p_key, ''))
  limit 1;

  return v_value;
end;
$setting$;

revoke all on function public.admin_get_setting(text, text) from public;
grant execute on function public.admin_get_setting(text, text) to anon, authenticated;
