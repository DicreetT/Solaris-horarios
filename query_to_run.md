# SQL Query for External Supabase Project
Please run this query in the SQL Editor of your other Supabase project (the `ryemqddhchdmywmlmhlx` one).

```sql
SELECT 
  key, 
  (entry->>'id') as id,
  (entry->>'fecha') as fecha,
  (entry->>'tipo_movimiento') as tipo_movimiento,
  (entry->>'producto') as producto,
  (entry->>'cantidad') as cantidad,
  (entry->>'bodega') as bodega,
  left(entry->>'updated_at', 19) as updated_at,
  (entry->>'updated_by') as updated_by
FROM (
  SELECT key, jsonb_array_elements(payload) as entry
  FROM shared_json_state
) sub
WHERE (entry->>'fecha') IN ('2026-02-25', '2026-02-26', '46078', '46079', '46078.0', '46079.0')
LIMIT 50;
```
