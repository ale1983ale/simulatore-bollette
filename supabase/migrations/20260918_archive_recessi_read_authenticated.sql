grant select on table public.archive_recessi to anon, authenticated;

drop policy if exists "archive recessi select" on public.archive_recessi;

create policy "archive recessi select"
on public.archive_recessi
for select
to anon, authenticated
using (true);
