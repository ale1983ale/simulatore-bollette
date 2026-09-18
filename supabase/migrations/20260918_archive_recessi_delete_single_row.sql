drop function if exists public.archive_recessi_clear_all(text);

create or replace function public.archive_recessi_delete_row(
  p_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.archive_recessi
  where id = p_id;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object('deleted', deleted_count);
end;
$$;

revoke all on function public.archive_recessi_delete_row(bigint) from public;
grant execute on function public.archive_recessi_delete_row(bigint) to anon, authenticated;
