alter table public.production_agent_zones
add column if not exists include_in_report boolean not null default true;

update public.production_agent_zones
set include_in_report = true
where include_in_report is null;
