alter table public.recruiting_crm_events
  add column if not exists notes_override text,
  add column if not exists notes_override_updated_at timestamptz;

comment on column public.recruiting_crm_events.notes_override is
  'Nota modificata dalla webapp. Se non NULL prevale sulla nota ricevuta dal CRM nelle viste della webapp.';

comment on column public.recruiting_crm_events.notes_override_updated_at is
  'Ultima modifica manuale della nota CRM dalla webapp.';
