create table if not exists public.email_recipient_lists (
  owner_key text primary key,
  recipients jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.email_recipient_lists enable row level security;

grant select, insert, update on table public.email_recipient_lists to anon;

create policy "email recipient list select"
on public.email_recipient_lists
for select
to anon
using (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-client-info', '')
  = 'email-recipient-sync-' || owner_key
);

create policy "email recipient list insert"
on public.email_recipient_lists
for insert
to anon
with check (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-client-info', '')
  = 'email-recipient-sync-' || owner_key
);

create policy "email recipient list update"
on public.email_recipient_lists
for update
to anon
using (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-client-info', '')
  = 'email-recipient-sync-' || owner_key
)
with check (
  coalesce(current_setting('request.headers', true)::jsonb ->> 'x-client-info', '')
  = 'email-recipient-sync-' || owner_key
);
