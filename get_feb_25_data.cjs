const pkg = require('pg');
const { Client } = pkg;

const connectionString = 'postgresql://postgres.ryemqddhchdmywmlmhlx:sOq_E1f@3H6bZ*@aws-0-eu-west-3.pooler.supabase.com:5432/postgres';

async function main() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('Connected to Canet database');

        const resCanet = await client.query(`
      select id, fecha, tipo_movimiento, bodega, producto, lote, cantidad, cantidad_signed, signo, cliente, destino, notas
      from movimientos_canet
      where fecha = '2026-02-25'
      order by id asc
    `);

        console.log('--- Movimientos Canet (Feb 25) ---');
        console.log(JSON.stringify(resCanet.rows, null, 2));

        const resInv = await client.query(`
      select id, fecha, tipo_movimiento, bodega, producto, lote, cantidad, cantidad_signed, signo, cliente, destino, notas
      from movimientos_inventario
      where fecha = '2026-02-25'
      order by id asc
    `);

        console.log('--- Movimientos Inventario (Feb 25) ---');
        console.log(JSON.stringify(resInv.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

main();
