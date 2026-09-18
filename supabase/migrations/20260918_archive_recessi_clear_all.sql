create or replace function public.archive_recessi_clear_all(
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if p_confirmation <> 'ELIMINA TUTTO' then
    raise exception 'Conferma eliminazione non valida';
  end if;

  delete from public.archive_recessi;
  get diagnostics deleted_count = row_count;

  return jsonb_build_object('deleted', deleted_count);
end;
$$;

revoke all on function public.archive_recessi_clear_all(text) from public;
grant execute on function public.archive_recessi_clear_all(text) to anon, authenticated;
