-- Fix historial de Itzi en febrero 2026:
-- - Conserva la hora de entrada original de cada dia.
-- - Ajusta salida a entrada + 8 horas.
-- - Mantiene el dia actual intacto (2026-02-20).
-- - Deja un solo registro por dia para evitar bloques duplicados.

begin;

with ranked as (
    select
        id,
        user_id,
        date_key,
        entry,
        row_number() over (
            partition by user_id, date_key
            order by inserted_at asc, id asc
        ) as rn
    from time_entries
    where user_id = 'cb5d2e6e-9046-4b22-b509-469076999d78'
      and date_key >= '2026-02-01'
      and date_key < '2026-03-01'
      and date_key <> '2026-02-20'
)
update time_entries t
set
    exit = to_char((ranked.entry::time + interval '8 hour')::time, 'HH24:MI'),
    status = 'present',
    note = trim(both from concat_ws(' ', nullif(t.note, ''), '[ajuste_8h_feb_2026]'))
from ranked
where t.id = ranked.id
  and ranked.rn = 1
  and ranked.entry is not null;

with ranked as (
    select
        id,
        row_number() over (
            partition by user_id, date_key
            order by inserted_at asc, id asc
        ) as rn
    from time_entries
    where user_id = 'cb5d2e6e-9046-4b22-b509-469076999d78'
      and date_key >= '2026-02-01'
      and date_key < '2026-03-01'
      and date_key <> '2026-02-20'
)
delete from time_entries t
using ranked
where t.id = ranked.id
  and ranked.rn > 1;

commit;
