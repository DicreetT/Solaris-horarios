const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://postgres.ryemqddhchdmywmlmhlx:sOq_E1f@3H6bZ*@aws-0-eu-west-3.pooler.supabase.com:5432/postgres';

const client = new Client({
    connectionString: connectionString,
});

async function run() {
    try {
        await client.connect();
        console.log("Conectado a la base de datos antigua.");

        const query = `
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
        SELECT key, jsonb_array_elements(
          CASE 
            WHEN jsonb_typeof(payload) = 'array' THEN payload 
            ELSE '[]'::jsonb 
          END
        ) as entry
        FROM shared_json_state
      ) sub
      WHERE (entry->>'fecha') IN ('2026-02-25', '2026-02-26', '46078', '46079', '46078.0', '46079.0')
      LIMIT 100;
    `;

        const res = await client.query(query);
        console.log(`\nEncontrados ${res.rows.length} registros para el 25/26 de febrero:`);
        console.table(res.rows);

        fs.writeFileSync('datos_rescatados.json', JSON.stringify(res.rows, null, 2));
        console.log("\nDatos guardados en 'datos_rescatados.json'.");

    } catch (err) {
        console.error("Error al ejecutar la consulta:", err.message);
    } finally {
        await client.end();
    }
}

run();
