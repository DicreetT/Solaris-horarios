const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.ryemqddhchdmywmlmhlx:sOq_E1f@3H6bZ*@aws-0-eu-west-3.pooler.supabase.com:5432/postgres' });
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
