import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type ManualUserKey = 'thalia' | 'itzi' | 'anabella' | 'heidy' | 'esteban' | 'fer' | string;

type ManualSection = {
  title: string;
  text: string;
  rows?: Array<[string, string]>;
};

const commonSidebarRows: Array<[string, string]> = [
  ['Mi espacio', 'Inicio personal. Muestra resumen de decisiones, menciones, tareas, checklist, proyectos y widgets propios del rol.'],
  ['Checklist diario', 'Lista personal ligera para organizar el dia. No asigna trabajo a otras personas.'],
  ['Tareas', 'Tareas del equipo asignadas a mi o creadas por mi. Una tarea es una accion concreta delegable.'],
  ['Menciones para mi', 'Bandeja de objetos donde alguien me menciono para informar, consultar, participar, validar o decidir.'],
  ['Proyectos', 'Cartera de proyectos visibles para mi segun privacidad, participacion o menciones.'],
  ['Avisos', 'Comunicaciones fechadas para una persona, area o todo el equipo.'],
  ['Calendario', 'Vista mensual de avisos, ausencias, reuniones, formaciones y fechas importantes.'],
  ['Mi jornada', 'Planificacion personal de horas y bloques de trabajo.'],
  ['Solicitudes', 'Mis solicitudes y solicitudes recibidas: vacaciones, ausencias, permisos o apoyo.'],
  ['Control de stock', 'Consulta compartida del stock para revisar disponibilidad por producto/lote.'],
  ['Solicitud de apoyo', 'Permite pedir apoyo de Fer. Esteban organiza y prioriza esas solicitudes.'],
  ['Documentos y recursos', 'Entrada a carpetas internas: despachos, cierre de mes y recursos conectados al Drive de Solaris.'],
];

const roleManuals: Record<string, { area: string; sections: ManualSection[] }> = {
  thalia: {
    area: 'Direccion',
    sections: [
      {
        title: 'Mi espacio de Thalia',
        text: 'Esta vista esta pensada para direccion por excepcion: decisiones, validaciones, menciones relevantes, estado de areas y formaciones. No busca mostrar toda la operacion, sino lo que requiere vision o decision.',
        rows: [
          ['Decisiones pendientes', 'Menciones de tipo Validar o Decidir que requieren respuesta.'],
          ['Menciones para mi', 'Informacion, consultas o participacion donde Thalia fue mencionada.'],
          ['Estado general de areas', 'Resumen desplegable de ventas, operaciones, inventario, finanzas y formacion.'],
          ['Formacion y aprendizaje', 'Formaciones que Thalia crea, estructura y activa para el equipo.'],
          ['Calendario/Jornada', 'Bloques horarios y reuniones con posibilidad de mencionar personas.'],
        ],
      },
      {
        title: 'Mi area',
        text: 'Contiene accesos de direccion: cupones y descuentos, informes, formacion, trazabilidad y facturacion a pagar.',
      },
    ],
  },
  itzi: {
    area: 'Ventas y soporte de alumnos',
    sections: [
      {
        title: 'Mi espacio de Itzi',
        text: 'Agrupa soporte humano de alumnos, formaciones activas y señales comerciales. Las formaciones vienen de las que Thalia activa.',
        rows: [
          ['Soporte de alumnos', 'Dudas, incidencias, acceso, contenido y observaciones por formacion.'],
          ['Formaciones activas', 'Lista real de formaciones activas creadas desde Direccion.'],
          ['Radar comercial', 'Necesidades detectadas, oportunidades y propuestas organizadas por etapas.'],
          ['Preguntas frecuentes', 'Preguntas sobre formaciones, producto o empresa, con tags para detectar patrones.'],
          ['Cuaderno comercial', 'Registro de necesidades, ideas y aprendizajes por producto/contexto.'],
        ],
      },
      {
        title: 'Radar comercial',
        text: 'Cada necesidad se registra como senal. Si se repite o tiene propuesta, puede pasar a oportunidad. Si ya es accionable, puede convertirse en proyecto. Las solventadas o archivadas quedan en historial.',
      },
    ],
  },
  anabella: {
    area: 'Inventario y almacen',
    sections: [
      {
        title: 'Mi espacio de Anabela',
        text: 'Prioriza pedidos, stock critico, incidencias de producto/lote, despachos y control diario de inventario.',
        rows: [
          ['Pedidos de hoy', 'Resumen de preparacion y salida del dia.'],
          ['Stock critico', 'Se alimenta de Control de stock.'],
          ['Incidencias producto/lote', 'Antes albaranes: danos, incidencias y documentacion por lote.'],
          ['Evento diario inventario', 'Control diario con movimientos, stock Lunaris, fisico, Zoho y revisiones.'],
          ['Carpeta despachos', 'Historico de despachos guardados por dia desde Documentos y recursos.'],
        ],
      },
    ],
  },
  heidy: {
    area: 'Finanzas y administracion',
    sections: [
      {
        title: 'Mi espacio de Heidy',
        text: 'Resume cierre de mes, compras, facturacion, informes, promociones y validaciones economicas.',
        rows: [
          ['Cierre del mes', 'Facturas por revisar, conciliacion, gastos e informe mensual.'],
          ['Compras', 'Solicitudes de compra recibidas y estado de compra/entrega.'],
          ['Cupones y promociones', 'Validacion economica de promociones propuestas.'],
          ['Informes', 'Informes mensuales y documentos para Direccion.'],
          ['Control operativo', 'Parte financiera/conciliacion del cierre operativo.'],
        ],
      },
    ],
  },
  esteban: {
    area: 'Operaciones, proyectos y sistemas',
    sections: [
      {
        title: 'Mi espacio de Esteban',
        text: 'Centrado en prioridades semanales, proyectos, menciones, jornada semanal, soporte operativo para Fer y decisiones a preparar.',
        rows: [
          ['Prioridades de la semana', 'Hasta tres proyectos marcados como foco activo.'],
          ['Cartera de proyectos', 'Lista completa de proyectos con prioridad, estado, fecha, pasos y progreso.'],
          ['Operaciones', 'Plan semanal de Esteban, entregables y asignacion de apoyo a Fer.'],
          ['Solicitud de apoyo', 'Solicitudes para Fer que Esteban puede ordenar/priorizar.'],
          ['Informes', 'Informe de sistemas y borrador de operaciones/proyectos.'],
        ],
      },
      {
        title: 'Proyectos',
        text: 'Los proyectos son privados inicialmente. Se comparten por menciones, participacion, tareas vinculadas o permisos. Los pasos tienen peso y estado para calcular progreso.',
      },
    ],
  },
  fer: {
    area: 'Soporte operativo',
    sections: [
      {
        title: 'Mi espacio de Fer',
        text: 'Debe ser sencillo: jornada, checklist, tareas asignadas, proyectos en los que participa y entregables de la semana.',
        rows: [
          ['Jornada semanal', 'Bloques de trabajo de almacen/proyectos y solicitudes de apoyo confirmadas.'],
          ['Tareas asignadas', 'Tareas del modulo normal de Tareas.'],
          ['Entregables', 'Siguientes pasos semanales derivados de proyectos donde participa.'],
          ['Progreso semanal', 'Resumen de entregables/tareas completadas sin metricas artificiales.'],
        ],
      },
    ],
  },
};

const commonAreaItemDescriptions: Record<string, string> = {
  'Cupones y descuentos': 'Espacio comun para crear propuestas de cupones o promociones. Nacen como propuesta/en validacion: se puede mencionar a Heidi para revisar rentabilidad y a otras personas para consultar, validar o decidir. Cuando queda validado y activo, aparece en la lista de cupones activos de todos.',
  'Crear proyecto': 'Acceso para crear una idea de proyecto con objetivo, resultado esperado, pasos, porcentajes y seguimiento. El proyecto empieza privado y se comparte solo cuando se menciona, asigna o involucra a otra persona.',
  'Proyectos': 'Cartera de proyectos del usuario. Permite abrir proyectos, revisar avance, pasos, prioridad, fechas, decisiones, observaciones y personas involucradas segun permisos.',
  'Control operativo': 'Modulo de cierre operativo mensual. Lo usan los perfiles que participan en el cierre para revisar su parte y generar informacion de cierre sin duplicar datos.',
  'Evento inventario': 'Control diario de inventario: movimientos, stock, revisiones y observaciones para cerrar el dia de inventario.',
  'Evento diario inventario': 'Control diario de inventario creado desde almacen. Permite revisar movimientos, stock Lunaris, fisico, Zoho, diferencias y validaciones de Anabela, Itzi y Heidy.',
  'Despachos': 'Modulo/carpeta operativa donde se guardan y consultan despachos, facturas, etiquetas, clientes, productos, lotes y cantidades del dia.',
  'Informes': 'Espacio de informes generados o subidos por el usuario. Los informes relevantes se reflejan en Direccion para seguimiento.',
  'Facturacion': 'Espacio para subir o revisar documentos de facturacion propios del usuario y su estado, sin ver documentos privados de otras personas.',
  'Facturacion a pagar': 'Cola de Direccion para revisar pagos pendientes, proveedores, facturas y documentos que otras personas hayan enviado para pago.',
  'Compras': 'Solicitud y seguimiento de compras. El usuario registra lo que necesita; Finanzas puede revisar, observar, aprobar, comprar y marcar entrega.',
  'Control de stock': 'Consulta del stock disponible por producto/lote. Sirve para tomar decisiones de ventas, proyectos, inventario o compras.',
};

const roleAreaItemDescriptions: Record<string, Record<string, string>> = {
  thalia: {
    'Informes': 'Vista de Direccion donde llegan informes de areas: cierre de mes, operaciones, sistemas, inventario, jornada y otros documentos relevantes.',
    'Formacion': 'Panel de Direccion para crear, editar y activar formaciones. Al activar una formacion, aparece para Itzi y para quienes deban verla.',
    'Trazabilidad': 'Acceso de Direccion al dossier de trazabilidad y consulta de lotes/procesos cuando se necesita revisar contexto completo.',
  },
  itzi: {
    'Cuaderno comercial': 'Radar comercial de Itzi: registra necesidades, oportunidades y propuestas. Usa producto, frecuencia, propuesta de solucion y tags para detectar patrones y convertirlos en proyectos cuando tenga sentido.',
    'Preguntas frecuentes': 'Gestiona preguntas de alumnos, formaciones, productos y empresa. Sirve para detectar dudas repetidas y convertirlas luego en FAQ, material, contenido o proyecto.',
    'Informes': 'Informes comerciales o de soporte que Itzi genere para Direccion, como resumen de preguntas, necesidades detectadas o cierre de actividad.',
  },
  anabella: {
    'Stock': 'Vista operativa de stock de Canet para revisar disponibilidad y contexto de almacen.',
    'Incidencias producto/lote': 'Antigua funcionalidad de albaranes presentada como incidencias: producto, lote, dano, cantidad, observacion y documentacion.',
    'Compras': 'Solicitud de compras necesarias para bodega o almacen. Lo que Anabela solicita llega a Heidy para validar, comprar y marcar estado.',
    'Informes': 'Informes de inventario, stock por lote, incidencias y cierre mensual que se pueden generar para Direccion.',
  },
  heidy: {
    'Compras': 'Bandeja de solicitudes de compra recibidas. Permite revisar, responder, aprobar, marcar comprado, en reparto, recibido u observar alternativas.',
    'Informes': 'Informes financieros y administrativos: socios, perdidas y ganancias, gastos/proveedores, cierre mensual y documentos para Direccion.',
    'Proyectos costes': 'Vista economica de proyectos donde Heidy participa o fue mencionada. Permite aportar cotizaciones, costes, viabilidad y observaciones.',
    'Facturacion': 'Gestion de facturacion, documentos pendientes, pagos y seguimiento financiero propio de administracion.',
  },
  esteban: {
    'Operaciones': 'Plan de operaciones de Esteban: jornada semanal, entregables, seguimiento de proyectos y asignacion/organizacion de apoyo operativo de Fer.',
    'Solicitud de apoyo': 'Bandeja de solicitudes de apoyo para Fer. Esteban puede crear solicitudes, revisar las de otros y ordenar prioridades para que Fer vea sus focos.',
    'Informes': 'Informe de sistemas y borrador de operaciones/proyectos. Sirve para resumir avances, bloqueos, proyectos completados y pendientes del mes.',
    'Formaciones activas': 'Vista informativa de formaciones activas para que Esteban pueda entender contexto, materiales o necesidades de marketing/operacion.',
    'Facturacion': 'Espacio de Esteban para enviar documentos o solicitudes de pago propios, sin ver la cola completa de otros usuarios.',
  },
  fer: {
    'Entregables': 'Vista semanal de entregables de Fer: proyectos en los que participa, siguientes pasos, avance y compromisos de la semana.',
    'Jornada semanal': 'Calendario semanal de Fer para organizar bloques de almacen, operaciones, proyectos y apoyos confirmados.',
    'Informes': 'Informe semanal o mensual de Fer: avance, tareas completadas, proyectos apoyados, horas y observaciones para Direccion.',
  },
};

function getAreaItemDescription(userKey: ManualUserKey, label: string) {
  const roleSpecific = roleAreaItemDescriptions[String(userKey)]?.[label];
  return roleSpecific || commonAreaItemDescriptions[label] || 'Acceso especifico del area. Su contenido se adapta al rol, permisos y objetos visibles de este usuario.';
}

function safeFilePart(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'usuario';
}

function addSection(doc: jsPDF, section: ManualSection, y: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  let cursor = y;
  if (cursor > pageHeight - 120) {
    doc.addPage();
    cursor = 46;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(section.title, 40, cursor);
  cursor += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(section.text, 515);
  doc.text(lines, 40, cursor);
  cursor += lines.length * 12 + 10;

  if (section.rows?.length) {
    autoTable(doc, {
      head: [['Elemento', 'Como funciona']],
      body: section.rows,
      startY: cursor,
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 5,
        overflow: 'linebreak',
        textColor: [17, 24, 39],
        lineColor: [229, 231, 235],
        lineWidth: 0.4,
      },
      headStyles: {
        fillColor: [240, 253, 250],
        textColor: [15, 118, 110],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 145, fontStyle: 'bold' },
        1: { cellWidth: 370 },
      },
      margin: { left: 40, right: 40 },
    });
    cursor = ((doc as any).lastAutoTable?.finalY || cursor) + 20;
  }
  return cursor;
}

export function downloadUserManualPdf(params: {
  userKey: ManualUserKey;
  userName: string;
  areaItems: string[];
}) {
  const manual = roleManuals[String(params.userKey)] || roleManuals.thalia;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const today = new Date().toLocaleDateString('es-ES');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(`Manual rapido Lunaris · ${params.userName}`, 40, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Area: ${manual.area} · Generado: ${today}`, 40, 64);

  let y = 94;
  y = addSection(doc, {
    title: 'Que es Mi espacio',
    text: 'Mi espacio es el inicio personal de cada usuario. Resume lo que requiere atencion hoy y enlaza con los modulos reales. No duplica informacion: muestra vistas de tareas, menciones, proyectos, avisos, calendario, jornada, solicitudes y datos del area.',
  }, y);

  y = addSection(doc, {
    title: 'Sidebar comun',
    text: 'La primera parte del sidebar es comun para todos. Sirve para moverse por los modulos personales y compartidos sin entrar en el espacio privado de otra persona.',
    rows: commonSidebarRows,
  }, y);

  const areaRows = params.areaItems.length > 0
    ? params.areaItems.map((label) => [label, getAreaItemDescription(params.userKey, label)] as [string, string])
    : [['Sin accesos de area', 'Este usuario trabaja principalmente con el sidebar comun.'] as [string, string]];

  y = addSection(doc, {
    title: 'Mi area en el sidebar',
    text: 'Debajo de Mi area aparecen herramientas propias del rol. Estos botones no significan que todos vean lo mismo: cada usuario entra a su version o a la informacion permitida.',
    rows: areaRows,
  }, y);

  manual.sections.forEach((section) => {
    y = addSection(doc, section, y);
  });

  y = addSection(doc, {
    title: 'Regla de privacidad',
    text: 'Un usuario solo ve objetos ajenos concretos cuando esta mencionado, asignado, participa en un proyecto o tiene permiso por funcion. Ver una mencion, tarea o proyecto no abre el espacio personal completo de quien lo creo.',
  }, y);

  doc.save(`manual-lunaris-${safeFilePart(params.userName)}.pdf`);
}
