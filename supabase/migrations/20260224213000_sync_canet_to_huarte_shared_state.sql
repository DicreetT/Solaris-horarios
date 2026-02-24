-- Real-time persisted mirror: when Canet movements key changes, mirror into Huarte movements key.
-- This removes dependency on page polling/open state.

create or replace function public.sync_canet_movs_to_huarte_shared_state()
returns trigger
language plpgsql
as $$
declare
  canet_payload jsonb := coalesce(new.payload, '[]'::jsonb);
  existing_huarte jsonb := '[]'::jsonb;
  non_canet_huarte jsonb := '[]'::jsonb;
  mirrored_canet jsonb := '[]'::jsonb;
  merged_payload jsonb := '[]'::jsonb;
begin
  if new.key <> 'inventory_canet_movimientos_v1' then
    return new;
  end if;

  if jsonb_typeof(canet_payload) <> 'array' then
    canet_payload := '[]'::jsonb;
  end if;

  select payload
  into existing_huarte
  from public.shared_json_state
  where key = 'invhf_movimientos_v1'
  limit 1;

  existing_huarte := coalesce(existing_huarte, '[]'::jsonb);
  if jsonb_typeof(existing_huarte) <> 'array' then
    existing_huarte := '[]'::jsonb;
  end if;

  -- Keep only non-Canet rows already present in Huarte.
  select coalesce(jsonb_agg(row_elem), '[]'::jsonb)
  into non_canet_huarte
  from jsonb_array_elements(existing_huarte) as row_elem
  where lower(coalesce(row_elem->>'source', '')) <> 'canet';

  -- Build mirrored Canet rows with deterministic ids and source metadata.
  with parsed as (
    select
      elem,
      case
        when coalesce(elem->>'id', '') ~ '^[0-9]+$' then (elem->>'id')::bigint
        else null
      end as canet_id
    from jsonb_array_elements(canet_payload) as elem
  ),
  normalized as (
    select
      (
        elem
        || jsonb_build_object(
          'source', 'canet',
          'origin_canet_id', canet_id,
          'id', case when canet_id is null then null else (900000000 + canet_id) end
        )
      ) as row_json
    from parsed
    where canet_id is not null
  )
  select coalesce(jsonb_agg(row_json), '[]'::jsonb)
  into mirrored_canet
  from normalized;

  merged_payload := mirrored_canet || non_canet_huarte;

  insert into public.shared_json_state(key, payload, updated_by)
  values ('invhf_movimientos_v1', merged_payload, 'canet-sync-trigger')
  on conflict (key)
  do update set
    payload = excluded.payload,
    updated_by = excluded.updated_by;

  return new;
end;
$$;

drop trigger if exists trg_sync_canet_movs_to_huarte_shared_state on public.shared_json_state;
create trigger trg_sync_canet_movs_to_huarte_shared_state
after insert or update on public.shared_json_state
for each row
execute function public.sync_canet_movs_to_huarte_shared_state();

