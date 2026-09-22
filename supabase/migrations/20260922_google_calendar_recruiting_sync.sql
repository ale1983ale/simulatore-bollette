alter table public.recruiting_events
  add column if not exists google_event_id text,
  add column if not exists google_calendar_id text not null default 'primary',
  add column if not exists google_sync_status text not null default 'pending',
  add column if not exists google_sync_error text not null default '',
  add column if not exists google_synced_at timestamptz;

create index if not exists recruiting_events_google_event_idx
  on public.recruiting_events(owner_key, google_event_id);

create table if not exists public.google_calendar_connections (
  admin_id bigint primary key references public.admin_users(id) on delete cascade,
  access_token text not null default '',
  refresh_token text not null default '',
  token_type text not null default 'Bearer',
  scope text not null default '',
  expires_at timestamptz,
  calendar_id text not null default 'primary',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.google_calendar_connections enable row level security;
revoke all on table public.google_calendar_connections from public, anon, authenticated;

create table if not exists public.google_calendar_oauth_states (
  state_hash text primary key,
  admin_id bigint not null references public.admin_users(id) on delete cascade,
  return_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);

create index if not exists google_calendar_oauth_states_expiry_idx
  on public.google_calendar_oauth_states(expires_at);

alter table public.google_calendar_oauth_states enable row level security;
revoke all on table public.google_calendar_oauth_states from public, anon, authenticated;
