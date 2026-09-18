-- Deduplica RECESSI per cliente + POD/PDR + mese/anno di validità.
-- Recessi dello stesso cliente nello stesso mese restano una sola riga.
-- Recessi in mesi/anni diversi restano distinti.

create temporary table archive_recessi_month_keys on commit drop as
select
  id,
  case
    when dedup_key like 'ROW|%' or coalesce(month_key, '') = '' then dedup_key
    else split_part(dedup_key, '|', 1) || '|' ||
         split_part(dedup_key, '|', 2) || '|' ||
         split_part(dedup_key, '|', 3) || '|' ||
         month_key
  end as month_dedup_key,
  min(id) over (
    partition by
      case
        when dedup_key like 'ROW|%' or coalesce(month_key, '') = '' then dedup_key
        else split_part(dedup_key, '|', 1) || '|' ||
             split_part(dedup_key, '|', 2) || '|' ||
             split_part(dedup_key, '|', 3) || '|' ||
             month_key
      end
  ) as keeper_id
from public.archive_recessi;

with merged_files as (
  select
    k.month_dedup_key,
    coalesce(array_agg(distinct sf order by sf) filter (where sf is not null and sf <> ''), '{}'::text[]) as source_files
  from archive_recessi_month_keys k
  join public.archive_recessi a on a.id = k.id
  left join lateral unnest(a.source_files) as sf on true
  group by k.month_dedup_key
),
merged_sheets as (
  select
    k.month_dedup_key,
    coalesce(array_agg(distinct ss order by ss) filter (where ss is not null and ss <> ''), '{}'::text[]) as source_sheets
  from archive_recessi_month_keys k
  join public.archive_recessi a on a.id = k.id
  left join lateral unnest(a.source_sheets) as ss on true
  group by k.month_dedup_key
)
update public.archive_recessi a
set
  source_files = mf.source_files,
  source_sheets = ms.source_sheets,
  updated_at = now()
from archive_recessi_month_keys k
join merged_files mf on mf.month_dedup_key = k.month_dedup_key
join merged_sheets ms on ms.month_dedup_key = k.month_dedup_key
where a.id = k.keeper_id
  and k.id = k.keeper_id;

delete from public.archive_recessi a
using archive_recessi_month_keys k
where a.id = k.id
  and k.id <> k.keeper_id;

update public.archive_recessi a
set
  dedup_key = k.month_dedup_key,
  updated_at = now()
from archive_recessi_month_keys k
where a.id = k.keeper_id
  and a.id = k.id
  and a.dedup_key <> k.month_dedup_key;
