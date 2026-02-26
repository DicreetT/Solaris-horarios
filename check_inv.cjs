const { Client } = require('pg');

const connectionString = 'postgresql://postgres.ryemqddhchdmywmlmhlx:sOq_E1f@3H6bZ*@aws-0-eu-west-3.pooler.supabase.com:5432/postgres';

const client = new Client({ connectionString });

async function check() {
    await client.connect();

    // 1. Check all Canet movements for 'SV'
    const resCanet = await client.query(`
    select id, fecha, tipo_movimiento, bodega, producto, lote, cantidad, cantidad_signed, signo, cliente, destino, notas
    from movimientos_canet
    where ((producto ilike '%SV%') or (producto ilike '%S.V%'))
    and fecha >= '2025-02-01'
    order by fecha asc, id asc
  `);

    console.log("=== CANET SV MOVEMENTS ===");
    resCanet.rows.forEach(r => console.log(JSON.stringify(r)));

    // 2. Check all own movements for 'SV'
    const resOwn = await client.query(`
    select id, fecha, tipo_movimiento, bodega, producto, lote, cantidad, cantidad_signed, signo, cliente, destino, notas, source
    from movimientos_inventario
    where ((producto ilike '%SV%') or (producto ilike '%S.V%'))
    and fecha >= '2025-02-01'
    order by fecha asc, id asc
  `);

    console.log("\n=== OWN SV MOVEMENTS ===");
    resOwn.rows.forEach(r => console.log(JSON.stringify(r)));

    await client.end();
}

check().catch(console.error);
