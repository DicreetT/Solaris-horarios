const pkg = require('pg');
const { Client } = pkg;

const password = encodeURIComponent('sOq_E1f@3H6bZ*');
const connectionString = `postgresql://postgres.ryemqddhchdmywmlmhlx:${password}@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`;

async function main() {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        const res = await client.query(`
      SELECT id, fecha, tipo_movimiento, bodega, producto, lote, cantidad, cantidad_signed, signo, cliente, destino, notas
      FROM movimientos_canet 
      WHERE fecha::text LIKE '2026-02-25%'
      OR fecha::text = '46078'
      OR fecha::text = '46078.0'
      ORDER BY id ASC
    `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
main();
