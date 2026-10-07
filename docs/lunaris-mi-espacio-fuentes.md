# Lunaris - Fuentes de verdad de Mi espacio

Objetivo: que cada tarjeta de `Mi espacio` muestre un dato real o un estado vacio honesto. No usar datos de maqueta como si fueran actividad del equipo.

Estados usados:

- `real`: sale de una entidad/hook existente.
- `derivado`: se calcula a partir de una o varias entidades reales.
- `cero hasta conectar`: queda en cero/sin registros hasta tener fuente clara.
- `necesita decision`: falta decidir exactamente de que entidad debe alimentarse.

## Base comun para todos

| Widget | Fuente actual | Estado | Vacio correcto |
| --- | --- | --- | --- |
| Cabecera: vencen hoy | `useTodos` -> tareas asignadas al usuario con `due_date_key = hoy` y no completadas por ese usuario | real | `Vencen hoy: 0` |
| Cabecera: pendientes | `useTodos` -> tareas asignadas al usuario y no completadas por ese usuario | real | `Pendientes: 0` |
| Cabecera: ausencias | `useAbsences` -> solicitudes aprobadas que cruzan la semana actual | real | `Ausencias: equipo completo` |
| Aviso activo hoy | `useAnnouncements` + visibilidad por usuario | real | no mostrar bloque |
| Decisiones pendientes | `useMentions` -> menciones del usuario, pendientes, tipo `validar` o `decidir` | real | `No hay decisiones ni validaciones pendientes` |
| Menciones para mi | `useMentions` -> menciones del usuario, pendientes, excluyendo validar/decidir | real | `No hay menciones informativas o de consulta pendientes` |
| Actividad de menciones | `useMentions` -> recibidas, enviadas y respondidas ordenadas por fecha | real | acordeon vacio |
| Tareas pendientes | `useTodos` -> primeras 3 pendientes asignadas al usuario | real | `No hay tareas pendientes` |
| Checklist diario | Supabase `daily_checklists` + `checklist_templates` del usuario | real | `Checklist al dia` |
| Mis proyectos | `useProjects` + `canUserSeeProject(usuario)` | real | `No hay proyectos visibles` |
| Cupones activos | proyectos tipo `cupon_promocion` + `promotionMeta.status = active` | derivado | `No hay cupones activos` |
| Guia de tags | contenido fijo de ayuda | real como guia | siempre visible |
| Mi jornada semanal | `useWeeklyWorkPlans` + fechas de proyectos/pasos/tareas | derivado | dias sin bloques ni fechas |
| Calendario del dia | `daily_agenda_v1` por usuario/fecha/hora | real | horas vacias |

## Thalia - Direccion

| Widget | Fuente actual | Estado | Nota |
| --- | --- | --- | --- |
| Estado general de areas | resumen por area alimentado desde modulos reales | derivado conectado | Ventas desde evento diario inventario/despachos; Operaciones desde proyectos; Inventario desde control de stock; Finanzas desde facturacion; Formacion desde formaciones activas. |
| Formacion y aprendizaje | `useSalesLearning.activeFormations` | real | Si no hay formaciones activas, muestra vacio honesto. |
| Calendario de hoy | `daily_agenda_v1` | real | Editable por hora; menciones en texto crean menciones. |

Detalle acordado para `Estado general de areas`:

- Ventas: se alimenta del control/evento diario de inventario, que a su vez resume despachos, ventas/envios y traspasos. Thalia ve solo resumen: numero de clientes del dia, numero/cantidad de ventas, productos, lotes movidos y cantidades.
- Operaciones: se alimenta de proyectos de todos los usuarios. Muestra proyectos activos de la semana, porcentaje de avance y usuario/responsable.
- Inventario: se alimenta de Control de stock. Muestra resumen de stock y alertas criticas, no una copia completa de la tabla.
- Finanzas: se alimenta de Facturacion. Muestra cantidad total a pagar y las tres facturas/proveedores de mayor importe.
- Formacion: se alimenta de formaciones activas. Muestra numero de formaciones activas o lista breve desplegable.

## Itzi - Ventas y soporte

| Widget | Fuente actual | Estado | Nota |
| --- | --- | --- | --- |
| Soporte de alumnos hoy | `useSalesLearning.support` pendiente, agrupado por tipo | real | Tipos: acceso, contenido, funcionamiento, otro. |
| Formaciones activas | `useSalesLearning.activeFormations` | real | Creadas/activadas desde Direccion. |
| Radar comercial | `useSalesLearning.needs`, `faqs`, `support` | derivado | Consultas = soporte real; oportunidades = necesidades en oportunidad/proyecto; FAQs = preguntas reales; necesidades = estado `need`. |
| Preguntas frecuentes nuevas | `useSalesLearning.faqs` | real | Si no hay, queda en cero. |
| Deteccion de necesidades | aun no se renderiza como lista real en Mi espacio | cero hasta conectar | La vista fuerte esta en Cuaderno comercial/Radar. |
| Accesos rapidos | eliminado de Mi espacio | real | Se quita para reducir ruido; las acciones viven en sus modulos: soporte, preguntas frecuentes, cuaderno comercial y proyectos. |

## Anabella - Inventario y almacen

| Widget | Fuente actual | Estado | Nota |
| --- | --- | --- | --- |
| Pedidos de hoy | modulo Despachos / facturacion archive por estado del pedido | derivado por conectar | Muestra solo numeros: pendientes, en preparacion y despachados hoy. `Listos para enviar` no aplica si no existe ese estado. |
| Stock critico | Control de stock / `inventory_alerts_summary_v1.criticalProducts` | real si existe resumen | Se alimenta del mismo control de stock que ya avisa criticidad y motivo. |
| Incidencias de producto | `albaranes_state_v1` -> danos del mes por producto | derivado | Usa antigua data de albaranes como incidencias producto/lote. |
| Evento diario inventario | ventas/envios/traspasos desde despachos, ensamblajes/movimientos desde inventario, stock desde inventario/control stock | derivado por conectar | Resumen minimo: ventas del dia, traspasos, ensamblajes si hay, stock sugerido por Lunaris/Canet y campos editables para fisico/Zoho. |
| Despachos de hoy | modulo Despachos, donde se suben facturas y se despacha | real si archive existe | Resume los despachos del dia; al despachar se crea el movimiento y alimenta el evento diario. |
| Carpeta despachos | `facturacion_archive_v1`, ultimos dias archivados | real si archive existe | La carpeta se mantiene como historico actualizado: dias, clientes, productos, lotes, facturas y etiquetas. |

## Heidy - Finanzas

| Widget | Fuente actual | Estado | Nota |
| --- | --- | --- | --- |
| Cierre del mes | control operativo actual de Lunaris | pendiente para fase posterior | Se revisara despues. Debe mantener el flujo actual del cierre de mes. |
| Cupones y promociones | cupones/promociones activas reales | derivado | Pendientes de validar viven en menciones/proyectos, no como dato inventado. |
| Compras pendientes | `useShoppingList.shoppingItems` no compradas | real | Muestra compras reales pendientes. |
| Informes mensuales | `useFinanceOperations.monthlyReports` del mes: socios, PyG, gastos/proveedores | real | Checklist Subido/Pendiente. |
| Solicitudes recibidas | solicitudes formales + compras + menciones validar/decidir | derivado por conectar | Agrupa lo que requiere respuesta de Heidy, sin inventar filas. |
| Control operativo | boton actual de Control operativo / cierre de mes | real por conectar | Debe abrir el control operativo existente. Heidy usa su parte de contabilidad, ventas/salidas y cierre. |

Importante: Heidy no ve `Sistemas / Analytics`; eso corresponde a Esteban.

## Esteban - Operaciones

| Widget | Fuente actual | Estado | Nota |
| --- | --- | --- | --- |
| Mis prioridades de esta semana | proyectos de Esteban con `weeklyPriorityRank` | real | Maximo visual: 3. |
| Fer soporte operativo | `useTodos` asignadas a Fer + completadas por Fer | real | Contadores y progreso salen de tareas reales. |
| Cartera completa proyectos | proyectos donde Esteban es responsable, dueno, participante o responsable de paso | real | Permite marcar/desmarcar prioridad semanal. |
| Solicitudes de apoyo | `useWeeklyWorkPlans` bloques de Fer tipo `support` | real | Orden/prioridad vive en operaciones/solicitud de apoyo. |
| Plan semanal de Esteban | `useWeeklyWorkPlans` usuario Esteban | real | Bloques semanales propios. |
| Informes de Esteban | `useFinanceOperations.monthlyReports` tipo `sistemas_analytics` y `proyectos` | real | Sistemas/Analytics con campos manuales; operaciones/proyectos como informe editable. |

## Fer - Soporte operativo

| Widget | Fuente actual | Estado | Nota |
| --- | --- | --- | --- |
| Mi jornada de hoy | base visual 4h almacen / 4h operaciones; bloques reales via jornada semanal | derivado | Falta decidir si el resumen diario debe venir solo de `useWeeklyWorkPlans`. |
| Mis tareas de hoy | `useTodos` asignadas a Fer | real | Si no hay, cero honesto. |
| Proyectos en los que participo | `useProjects` visibles para Fer | real | Solo proyectos donde participa/esta asignado/tiene permiso. |
| Siguientes pasos y progreso | tareas reales asignadas a Fer completadas vs totales | derivado | A futuro puede incluir pasos de proyecto, no solo tareas. |
| Mis entregables esta semana | tareas/pasos reales pendientes | derivado parcial | Ahora usa tareas pendientes; falta sumar pasos de proyecto con fecha semanal. |

## Evento diario inventario - fuente prevista

El evento/control diario inventario debe ser una plantilla mixta:

- Automatico/sugerido: ventas, envios, traspasos y clientes desde Despachos; ensamblajes y movimientos desde Inventario; stock de Canet/Lunaris desde inventario/control de stock.
- Manual/editable: stock fisico, stock Zoho, correcciones cuando Lunaris lea mal, observaciones.
- Comparaciones: Lunaris vs fisico, Lunaris vs Zoho, fisico vs Zoho, con diferencias visibles.
- Revisiones: Anabela revisa fisico, Itzi revisa movimientos/Zoho, Heidy revisa conciliacion.
- Salida para Direccion: cuando se cierre, alimenta Estado general de areas en Ventas/Inventario.

## Ambiguedades para decidir contigo

1. `Cierre del mes` de Heidy: se deja para despues, reutilizando Control operativo actual.
2. Fer: decidir si progreso semanal debe calcularse por tareas, pasos de proyecto, solicitudes de apoyo o una formula mixta.
3. `Estado general de areas`: conectado como resumen derivado. Siguiente mejora posible: abrir cada area en un panel detalle con la misma fuente, sin duplicar datos.
4. `Evento diario inventario`: conectar la plantilla mixta a los modulos reales existentes.

## Regla de mantenimiento

Antes de agregar una tarjeta nueva en `Mi espacio`, responder:

1. Que entidad real alimenta este widget?
2. El dato ya existe o estamos creando un nuevo sistema?
3. Que debe mostrar cuando no hay datos?
4. Quien tiene permiso para verlo?
5. Al hacer clic, a que modulo/objeto concreto debe abrir?
