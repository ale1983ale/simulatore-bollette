-- PRODUZIONE: deduplica per periodo + commodity + agente + N° POD/PDR
-- e salvataggio del file Excel originale in Supabase Storage.

update public.archive_produzione
set dedup_key =
  period_start::text || '|' ||
  period_end::text || '|' ||
  commodity || '|' ||
  agent_key || '|' ||
  in_attivazione_count::text
where dedup_key is distinct from (
  period_start::text || '|' ||
  period_end::text || '|' ||
  commodity || '|' ||
  agent_key || '|' ||
  in_attivazione_count::text
);

create table if not exists public.production_source_files (
  file_name text primary key,
  storage_path text not null unique,
  file_size bigint not null default 0,
  content_type text,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.production_source_files enable row level security;

grant select, insert, update, delete
on table public.production_source_files
to anon, authenticated;

drop policy if exists "production source files select" on public.production_source_files;
drop policy if exists "production source files insert" on public.production_source_files;
drop policy if exists "production source files update" on public.production_source_files;
drop policy if exists "production source files delete" on public.production_source_files;

create policy "production source files select"
on public.production_source_files for select
to anon, authenticated
using (true);

create policy "production source files insert"
on public.production_source_files for insert
to anon, authenticated
with check (true);

create policy "production source files update"
on public.production_source_files for update
to anon, authenticated
using (true)
with check (true);

create policy "production source files delete"
on public.production_source_files for delete
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('production-reports', 'production-reports', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "production reports storage select" on storage.objects;
drop policy if exists "production reports storage insert" on storage.objects;
drop policy if exists "production reports storage update" on storage.objects;
drop policy if exists "production reports storage delete" on storage.objects;

create policy "production reports storage select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'production-reports');

create policy "production reports storage insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'production-reports');

create policy "production reports storage update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'production-reports')
with check (bucket_id = 'production-reports');

create policy "production reports storage delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'production-reports');
