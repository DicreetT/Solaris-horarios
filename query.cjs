const { Client } = require('pg');
const user = 'postgres';
const password = encodeURIComponent('sOq_E1f@3H6bZ*');
const host = 'aws-0-eu-west-3.pooler.supabase.com';
const port = 5432;
const dbname = 'postgres';
const client = new Client({ connectionString: `postgresql://${user}.${'ryemqddhchdmywmlmhlx'}:${password}@${host}:${port}/${dbname}` });
async function check() {
  await client.connect();
  const res = await client.query(`
    select id, fecha, tipo_movimiento, bodega, producto, lote, cantidad, cantidad_signed, signo, cliente, destino, notas
    from movimientos_inventario
    where (bodega ilike '%huarte%') and (producto ilike '%sv%')
    order by fecha asc, id asc
  `);
  console.table(res.rows);
  await client.end();
}
check().catch(console.error);
