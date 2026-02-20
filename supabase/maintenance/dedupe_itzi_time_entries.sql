-- Dedupe de fichajes para Itzi (un solo registro por dia)
-- Mantiene:
-- - entrada mas temprana del dia
-- - salida mas tardia del dia
-- - constancia de pausa en note si existio en cualquiera de los duplicados

begin;

with per_day as (
    select
        user_id,
        date_key,
        min(entry) filter (where entry is not null) as min_entry,
        max(exit) filter (where exit is not null) as max_exit,
        bool_or(status = 'break_paid' or coalesce(note, '') like '%PAUSA_INICIO:%') as had_break,
        min(id) as keep_id
    from time_entries
    where user_id = 'cb5d2e6e-9046-4b22-b509-469076999d78'
    group by user_id, date_key
),
updated as (
    update time_entries t
    set
        entry = p.min_entry,
        exit = p.max_exit,
        status = case when p.had_break then 'break_paid' else coalesce(t.status, 'present') end,
        note = case
            when p.had_break and coalesce(t.note, '') not like '%PAUSA_INICIO:%'
                then trim(both from concat_ws(' ', nullif(t.note, ''), '[PAUSA_REGISTRADA]'))
            else t.note
        end
    from per_day p
    where t.id = p.keep_id
    returning t.id
)
delete from time_entries t
using per_day p
where t.user_id = p.user_id
  and t.date_key = p.date_key
  and t.id <> p.keep_id;

commit;
