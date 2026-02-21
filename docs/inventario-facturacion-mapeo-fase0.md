# Inventario / Facturación (Fase 0: mapeo)

## Archivos analizados
- `/Users/ivanoliveros/Downloads/SOLARIS_CONTROL STOCK DIARIO FINAL.26.xlsx`
- `/Users/ivanoliveros/Downloads/FACTURAS RECTIFICATIVAS.xlsx`
- `/Users/ivanoliveros/Downloads/ENSAMBLAJES SOLARVITAL.xlsx`
- `/Users/ivanoliveros/Downloads/ENTHEROVITAL.xlsx`
- `/Users/ivanoliveros/Downloads/ISOTONIC.xlsx`
- `/Users/ivanoliveros/Downloads/KALAH.xlsx`

## Hallazgos clave

### 1) `SOLARIS_CONTROL STOCK DIARIO FINAL.26.xlsx` (archivo núcleo)
Es el libro principal y ya contiene una arquitectura bastante clara:
- `Movimientos` (escritura): fuente de verdad operativa.
- `Lotes` (maestro de lotes por producto/bodega).
- `Bodegas` (maestro de bodegas).
- `TiposMovimiento` (catálogo de tipos).
- `Control_por_Lote` (cálculo con miles de fórmulas).
- `Dashboard` y `Dashboard.1` (resumen).

README del propio archivo confirma el flujo:
`Movimientos -> Bodegas -> Lotes -> Control_por_Lote -> Dashboard`

Columnas críticas detectadas en `Movimientos`:
- `Fecha`
- `Tipo_movimiento`
- `Producto`
- `lote`
- `Cantidad`
- `Bodega`
- `Cliente (solo venta)`
- `Destino (solo envio)`
- `Factura/Doc`
- `Responsable`
- `Notas`

Tipos de movimiento detectados (base):
- `entrada_bruto`
- `ensamblaje_esp`
- `ensamblaje_col`
- `venta`
- `envio`
- `ajuste+`
- `ajuste-`
- además hay `inicio` en datos históricos.

### 2) `FACTURAS RECTIFICATIVAS.xlsx` (subflujo especializado)
Tiene estructura similar al núcleo (Movimientos + Control + Dashboard), pero centrada en rectificativas.

Tipos detectados:
- `FACTURA a corregir`
- `FACTURA RECTIFICATIVA`
- `NOTA CREDITO`

Campos relevantes extra:
- `MOTIVO`
- `Factura/Doc`
- `Realizado por`

Conclusión: no es un sistema distinto; es una variante del mismo modelo de movimientos, con tipología y reglas propias.

### 3) Ensamblajes por producto (4 archivos)
- `ENSAMBLAJES SOLARVITAL.xlsx`
- `ENTHEROVITAL.xlsx`
- `ISOTONIC.xlsx`
- `KALAH.xlsx`

Patrón común:
- Hojas por lote.
- Bloques mensuales (ajustes / vendidas / columnas ES/COL según producto).
- Estructura semimanual para control por lote y mes.

Conclusión: estos cuatro pueden unificarse en una sola capa de datos de “ensamblajes y consumo por lote/mes”, evitando 4 archivos separados.

## Riesgos de migración (y cómo evitarlos)
- Riesgo: duplicar lógica de stock al recalcular en varias tablas.
  - Mitigación: única fuente de verdad = `movimientos` + tablas maestras.
- Riesgo: perder historial por sobreescritura.
  - Mitigación: eventos inmutables (insertar correcciones, no pisar histórico).
- Riesgo: inconsistencias de lotes/productos.
  - Mitigación: claves y validaciones estrictas (producto+lote+bodega).

## Propuesta de diseño objetivo en Lunaris

## Módulo nuevo
- Nombre: **Inventario / Facturación**
- Ubicación: sección propia en sidebar (separada de `Inventario Canet`).

## Submódulos (pestañas internas)
1. **Dashboard Huarte**
2. **Movimientos**
3. **Control por Lote**
4. **Rectificativas**
5. **Ensamblajes**
6. **Maestros** (Productos, Lotes, Bodegas, Tipos movimiento)

## Modelo de datos (Supabase, propuesta)
- `invhf_movements`
  - fecha, tipo_movimiento, producto, lote, cantidad, bodega, cliente, destino, factura_doc, responsable, motivo, notas, source
- `invhf_products`
- `invhf_lots`
- `invhf_warehouses`
- `invhf_movement_types`
- `invhf_rectificativas` (opcional: vista o tabla derivada de movements con tipos rectificativa)
- `invhf_assemblies`
  - producto, lote, mes, canal (`ES|COL`), cantidad, origen

## Vistas derivadas
- `invhf_stock_by_lot` (equivale a `Control_por_Lote`)
- `invhf_dashboard_totals`
- `invhf_sales_monthly`
- `invhf_adjustments_audit`

## Permisos (RBAC)
- Edición: Ichiar + Esteban (+ admin).
- Consulta: resto del equipo.
- Acciones sensibles (eliminar movimiento): solo admin o rol autorizado.

## Exportaciones
- PDF por módulo (tabla clara + filtros aplicados + fecha/hora + firma opcional).

## Decisiones técnicas confirmadas
- No replicar fórmulas Excel celda a celda.
- Migrar a modelo transaccional + vistas SQL calculadas.
- Mantener nombres y flujo visual parecidos para que Ichiar no pierda contexto.

## Fase 1 sugerida (implementación inmediata)
1. Crear ruta y UI base `Inventario / Facturación` con pestañas.
2. Crear esquema de tablas Supabase (sin borrar nada existente).
3. Importador inicial desde Excel -> tablas nuevas.
4. Tablero de movimientos con filtros y CRUD seguro.
5. Dashboard Huarte (KPIs + tablas equivalentes a Excel).

