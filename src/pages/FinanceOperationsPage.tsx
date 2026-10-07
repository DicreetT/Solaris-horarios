import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileText,
  Megaphone,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Send,
  ShoppingCart,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ESTEBAN_ID, USERS } from '../constants';
import { FileUploader } from '../components/FileUploader';
import { useAuth } from '../context/AuthContext';
import type { Attachment } from '../types';
import { useFinanceOperations, PromotionOperationalStatus } from '../hooks/useFinanceOperations';
import { MentionType, mentionTypeLabel, useMentions } from '../hooks/useMentions';
import { calculateProjectProgress, projectStatusLabel, projectTypeLabel, useProjects } from '../hooks/useProjects';
import { useShoppingList } from '../hooks/useShoppingList';
import canetInventorySeed from '../data/inventory_seed.json';

const REPORT_TYPES = [
  { key: 'socios', label: 'Informe de socios' },
  { key: 'perdidas_ganancias', label: 'Pérdidas y ganancias' },
  { key: 'gastos_proveedores', label: 'Gastos / proveedores' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'sistemas_analytics', label: 'Sistemas / Analytics' },
  { key: 'otros', label: 'Otros informes' },
] as const;

type ReportType = typeof REPORT_TYPES[number]['key'];

const HEIDY_REPORT_TYPES = REPORT_TYPES.filter((type) => (
  ['socios', 'perdidas_ganancias', 'gastos_proveedores'].includes(type.key)
));

const SYSTEMS_REPORT_FIELDS = [
  { key: 'entradas', label: 'Entradas revisadas entre sistemas' },
  { key: 'traspasos', label: 'Traspasos revisados entre sistemas' },
  { key: 'ensamblajes', label: 'Ensamblajes revisados entre sistemas' },
  { key: 'stock', label: 'Stock revisado entre sistemas' },
  { key: 'ventas', label: 'Ventas revisadas entre sistemas' },
  { key: 'diferencias', label: 'Total diferencias abiertas' },
  { key: 'productoMasVendido', label: 'Producto más vendido' },
  { key: 'productoMenosVendido', label: 'Producto menos vendido' },
  { key: 'variacion', label: 'Variación frente al mes anterior' },
] as const;

const MENTION_TYPES: MentionType[] = ['informar', 'consultar', 'participar', 'validar', 'decidir'];

type FinanceView = 'promociones' | 'informes' | 'compras' | 'costes';

const PREVIEW_ROLE_TO_USER_NAME: Record<string, string> = {
  direction: 'Thalia',
  sales: 'Itzi',
  warehouse: 'Anabella',
  finance: 'Heidy',
  operations: 'Esteban',
  support: 'Fer',
};

const ALL_FINANCE_VIEWS: FinanceView[] = ['promociones', 'informes', 'compras', 'costes'];

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function userName(id?: string | null) {
  return USERS.find((user) => user.id === id)?.name || 'Usuario';
}

function userArea(name?: string | null) {
  if (name === 'Thalia') return 'Dirección';
  if (name === 'Itzi') return 'Ventas';
  if (name === 'Anabella') return 'Inventario';
  if (name === 'Heidy') return 'Finanzas';
  if (name === 'Esteban') return 'Operaciones';
  if (name === 'Fer') return 'Soporte operativo';
  return 'General';
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function promoStatusLabel(status: PromotionOperationalStatus) {
  if (status === 'active') return 'Activo';
  if (status === 'scheduled') return 'Programado';
  if (status === 'finished') return 'Finalizado';
  return 'En revisión';
}

function promoStatusClass(status: PromotionOperationalStatus) {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'scheduled') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (status === 'finished') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function derivedPromotionStatus(projectStatus: string): PromotionOperationalStatus {
  if (projectStatus === 'done') return 'active';
  if (projectStatus === 'validation') return 'scheduled';
  if (projectStatus === 'paused') return 'finished';
  return 'in_review';
}

function normalizePromotionStatus(value: unknown): PromotionOperationalStatus | null {
  if (value === 'active' || value === 'scheduled' || value === 'finished' || value === 'in_review') return value;
  return null;
}

function projectPromotionStatus(project: { status?: string; promotionStatus?: unknown }, meta?: { status?: unknown }) {
  return normalizePromotionStatus(meta?.status)
    || normalizePromotionStatus(project.promotionStatus)
    || derivedPromotionStatus(project.status || 'pending');
}

function purchaseStatus(item: { is_purchased: boolean; delivery_date?: string }) {
  if (!item.is_purchased) return { label: 'Pendiente', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  if (item.delivery_date) return { label: 'En entrega', className: 'border-sky-200 bg-sky-50 text-sky-700' };
  return { label: 'Comprada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
}

function viewTitle(view: FinanceView) {
  if (view === 'informes') return 'Informes';
  if (view === 'compras') return 'Solicitudes de compra';
  if (view === 'costes') return 'Proyectos y costes';
  return 'Promociones';
}

function normalizeView(value: string | null): FinanceView {
  if (value === 'informes' || value === 'compras' || value === 'costes') return value;
  return 'promociones';
}

function effectiveFinanceUser(currentUser: ReturnType<typeof useAuth>['currentUser'], previewRoleKey: string | null) {
  if (!currentUser?.isAdmin || !previewRoleKey) return currentUser || null;
  const previewName = PREVIEW_ROLE_TO_USER_NAME[previewRoleKey];
  return USERS.find((user) => user.name === previewName) || currentUser;
}

export default function FinanceOperationsPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [previewRoleKey, setPreviewRoleKey] = useState<string | null>(() => (
    typeof window === 'undefined' ? null : window.localStorage.getItem('lunaris_role_preview')
  ));
  const effectiveUser = useMemo(() => effectiveFinanceUser(currentUser, previewRoleKey), [currentUser, previewRoleKey]);
  const effectiveUserName = effectiveUser?.name || currentUser?.name || '';
  const effectiveUserId = effectiveUser?.id || currentUser?.id || '';
  const isOperationsContext = effectiveUserName === 'Esteban';
  const isSalesContext = effectiveUserName === 'Itzi';
  const isWarehouseContext = effectiveUserName === 'Anabella';
  const isSupportContext = effectiveUserName === 'Fer';
  const isFinanceContext = effectiveUserName === 'Heidy';
  const isPromotionOnlyContext = ['Itzi', 'Anabella', 'Fer'].includes(effectiveUserName);
  const allowedViews: FinanceView[] = isOperationsContext
    ? ['promociones', 'informes']
    : isSalesContext
      ? ['promociones', 'informes']
      : isWarehouseContext
      ? ['promociones', 'informes']
      : isSupportContext
      ? ['promociones', 'informes']
      : isPromotionOnlyContext
      ? ['promociones']
      : ALL_FINANCE_VIEWS;
  const requestedView = normalizeView(searchParams.get('view'));
  const activeView = allowedViews.includes(requestedView) ? requestedView : allowedViews[0];
  const { projects, visibleProjects, createProject, updateProject } = useProjects(currentUser);
  const { createMention } = useMentions(currentUser);
  const { shoppingItems } = useShoppingList(currentUser);
  const { promotionMetaByProjectId, monthlyReports, updatePromotionMeta, upsertMonthlyReport, deleteMonthlyReport } = useFinanceOperations(currentUser);
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [reportDraft, setReportDraft] = useState({
    title: '',
    reportType: 'socios' as typeof REPORT_TYPES[number]['key'],
    notes: '',
    attachments: [] as Attachment[],
  });
  const [promoDraft, setPromoDraft] = useState({
    kind: 'coupon' as 'coupon' | 'promotion',
    name: '',
    reason: '',
    audience: '',
    maxPeople: '',
    products: '',
    couponCode: '',
    discount: '',
    startDate: '',
    endDate: '',
    howItWorks: '',
    status: 'in_review' as PromotionOperationalStatus,
    mentionTargetUserId: '',
    mentionType: 'consultar' as MentionType,
    mentionContext: '',
  });

  useEffect(() => {
    const handlePreviewRoleChange = () => {
      setPreviewRoleKey(window.localStorage.getItem('lunaris_role_preview'));
    };
    window.addEventListener('storage', handlePreviewRoleChange);
    window.addEventListener('lunaris-role-preview-change', handlePreviewRoleChange);
    return () => {
      window.removeEventListener('storage', handlePreviewRoleChange);
      window.removeEventListener('lunaris-role-preview-change', handlePreviewRoleChange);
    };
  }, []);

  const visibleProjectIds = useMemo(() => new Set(visibleProjects.map((project) => project.id)), [visibleProjects]);
  const canSeeOperationalPromotion = (project: { id: string; ownerId?: string; responsibleId?: string; participants?: string[]; status?: string }) => {
    if (!isOperationsContext && !isPromotionOnlyContext) {
      return !!currentUser?.isAdmin || visibleProjectIds.has(project.id) || ['Thalia', 'Itzi', 'Heidy', 'Esteban'].includes(currentUser?.name || '');
    }
    const meta = promotionMetaByProjectId[project.id];
    const status = projectPromotionStatus(project, meta);
    return (
      project.ownerId === effectiveUserId
      || project.responsibleId === effectiveUserId
      || (project.participants || []).includes(effectiveUserId)
      || status === 'active'
      || status === 'scheduled'
    );
  };

  const promotionProjects = projects
    .filter((project) => project.type === 'cupon_promocion')
    .filter(canSeeOperationalPromotion);

  const currentMonthReports = monthlyReports.filter((report) => report.monthKey === monthKey);
  const visibleCurrentMonthReports = isOperationsContext
    ? currentMonthReports.filter((report) => ['sistemas_analytics', 'proyectos'].includes(report.reportType))
    : isSalesContext
      ? currentMonthReports.filter((report) => report.reportType === 'ventas')
      : isWarehouseContext
      ? currentMonthReports.filter((report) => report.reportType === 'inventario')
      : isSupportContext
      ? currentMonthReports.filter((report) => report.updatedBy === effectiveUserId || report.notes?.includes('Área: Soporte operativo'))
      : isFinanceContext
      ? currentMonthReports.filter((report) => ['socios', 'perdidas_ganancias', 'gastos_proveedores'].includes(report.reportType))
    : currentMonthReports;
  const pendingPurchases = shoppingItems.filter((item) => !item.is_purchased);
  const estebanProjectRows = projects.filter((project) => (
    project.responsibleId === ESTEBAN_ID
    || project.ownerId === ESTEBAN_ID
    || project.participants.includes(ESTEBAN_ID)
  ));
  const projectCostRows = visibleProjects.filter((project) => (
    project.type === 'finanzas'
    || project.type === 'cupon_promocion'
    || project.participants.includes(currentUser?.id || '')
  ));

  const promotionCounts = useMemo(() => {
    return promotionProjects.reduce((acc, project) => {
      const meta = promotionMetaByProjectId[project.id];
      const status = projectPromotionStatus(project, meta);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<PromotionOperationalStatus, number>);
  }, [promotionMetaByProjectId, promotionProjects]);

  const handleSaveReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportDraft.title.trim()) return;
    upsertMonthlyReport({
      monthKey,
      title: reportDraft.title.trim(),
      reportType: reportDraft.reportType,
      notes: [
        `Área: ${userArea(effectiveUserName)}`,
        reportDraft.notes.trim(),
      ].filter(Boolean).join('\n\n'),
      attachments: reportDraft.attachments,
    });
    setReportDraft({ title: '', reportType: 'socios', notes: '', attachments: [] });
  };

  const handleGenerateSystemsReport = () => {
    upsertMonthlyReport({
      monthKey,
      title: `Informe sistemas / analytics · ${monthKey}`,
      reportType: 'sistemas_analytics',
      notes: [
        'Informe de Esteban · Operaciones / Sistemas',
        '',
        'SISTEMAS / ANALYTICS',
        '- Entradas revisadas entre sistemas:',
        '- Traspasos revisados entre sistemas:',
        '- Ensamblajes revisados entre sistemas:',
        '- Stock revisado entre sistemas:',
        '- Ventas revisadas entre sistemas:',
        '- Total diferencias abiertas:',
        '- Comentario sistemas/analytics:',
        '',
        'INDICADORES DEL MES',
        '- Producto más vendido:',
        '- Producto menos vendido:',
        '- Variación frente al mes anterior:',
      ].join('\n'),
      attachments: [],
    });
  };

  const handleGenerateOperationsProjectsReport = () => {
    const activeProjects = estebanProjectRows.filter((project) => project.status === 'in_progress' || project.weeklyPriorityRank);
    upsertMonthlyReport({
      monthKey,
      title: `Informe general operaciones y proyectos · ${monthKey}`,
      reportType: 'proyectos',
      notes: [
        'Informe de Esteban · Operaciones / Proyectos',
        `Proyectos en cartera: ${estebanProjectRows.length}`,
        `Proyectos activos/en foco: ${activeProjects.length}`,
        '',
        'RESUMEN DE PROYECTOS',
        ...estebanProjectRows.slice(0, 12).map((project) => {
          const progress = calculateProjectProgress(project);
          const nextStep = project.steps.find((step) => step.status !== 'completed');
          return `- ${project.name} · ${projectStatusLabel(project.status)} · ${progress.completed}% completado · siguiente: ${nextStep?.name || 'por definir'}`;
        }),
        '',
        'LOGROS DEL MES',
        '- ',
        '',
        'RETRASOS / BLOQUEOS',
        '- ',
        '',
        'PRÓXIMOS PASOS',
        '- ',
      ].join('\n'),
      attachments: [],
    });
  };

  const handleGenerateAreaReport = () => {
    const area = userArea(effectiveUserName);
    upsertMonthlyReport({
      monthKey,
      title: `Resumen ${area} · ${monthKey}`,
      reportType: effectiveUserName === 'Anabella' ? 'inventario' : effectiveUserName === 'Esteban' || effectiveUserName === 'Fer' ? 'proyectos' : 'otros',
      notes: [
        `Informe generado como borrador por ${effectiveUserName || 'usuario'}.`,
        `Área: ${area}`,
        'Completar con: logros del mes, pendientes, incidencias, retrasos, aprendizajes y próximos pasos.',
      ].join('\n'),
      attachments: [],
    });
  };

  const handleGenerateSalesClosingReport = () => {
    upsertMonthlyReport({
      monthKey,
      title: `Informe control operativo ventas · ${monthKey}`,
      reportType: 'ventas',
      notes: [
        'Informe de Itzi · Control operativo / cierre de mes',
        '',
        'CIERRE OPERATIVO',
        '- Despachos revisados:',
        '- Clientes del mes:',
        '- Ventas pendientes de revisar:',
        '- Incidencias abiertas:',
        '- Zoho / movimientos revisados:',
        '',
        'RESUMEN COMERCIAL',
        '- Formaciones activas:',
        '- Preguntas frecuentes detectadas:',
        '- Necesidades comerciales:',
        '- Oportunidades propuestas:',
        '',
        'PENDIENTES PARA DIRECCIÓN',
        '- ',
      ].join('\n'),
      attachments: [],
    });
  };

  const handleGenerateInventoryReport = () => {
    const lotRows = Array.isArray((canetInventorySeed as any).lotes)
      ? (canetInventorySeed as any).lotes
      : [];
    const activeLots = lotRows
      .filter((row: any) => String(row.estado || '').toUpperCase() !== 'INACTIVO')
      .slice(0, 80);

    upsertMonthlyReport({
      monthKey,
      title: `Informe inventario por lote · ${monthKey}`,
      reportType: 'inventario',
      notes: [
        'Informe de Anabella · Inventario / cierre de mes',
        '',
        'STOCK POR LOTE',
        ...activeLots.map((row: any) => `- ${row.producto || 'Producto'} · lote ${row.lote || 'sin lote'} · ${row.bodega || 'sin bodega'} · ${row.estado || 'sin estado'}`),
        '',
        'CONTROL OPERATIVO',
        '- Stock crítico revisado:',
        '- Incidencias producto/lote revisadas:',
        '- Despachos del mes revisados:',
        '- Evento diario de inventario conciliado:',
        '',
        'OBSERVACIONES PARA DIRECCIÓN',
        '- ',
      ].join('\n'),
      attachments: [],
    });
  };

  const handleCreatePromotion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser?.id || !effectiveUserId || !promoDraft.name.trim()) return;
    const kindLabel = promoDraft.kind === 'coupon' ? 'Cupón' : 'Promoción';
    const heidyUser = USERS.find((user) => ['heidy', 'heidi'].includes(user.name.toLowerCase()));
    const initialPromotionStatus = effectiveUserName === 'Heidy' ? promoDraft.status : 'in_review';
    const created = createProject({
      name: promoDraft.name.trim(),
      type: 'cupon_promocion',
      responsibleId: effectiveUserId,
      objective: promoDraft.reason.trim() || `${kindLabel} propuesto por ${effectiveUserName}`,
      description: [
        `${kindLabel} creado desde Promociones.`,
        promoDraft.reason ? `Motivo: ${promoDraft.reason}` : '',
        promoDraft.audience ? `Aplicable para: ${promoDraft.audience}` : '',
        promoDraft.maxPeople ? `Válido para: ${promoDraft.maxPeople}` : '',
        promoDraft.discount ? `Descuento/condición: ${promoDraft.discount}` : '',
        promoDraft.howItWorks ? `Funcionamiento: ${promoDraft.howItWorks}` : '',
      ].filter(Boolean).join('\n'),
      priority: 'medium',
      targetDate: promoDraft.endDate,
      expectedResult: `${kindLabel} documentado, validado y listo para comunicar si corresponde.`,
      completionDefinition: 'Condiciones, vigencia, público, productos, viabilidad y aprobación quedan definidos.',
      tags: [promoDraft.kind === 'coupon' ? 'cupon' : 'promocion', ...(promoDraft.products ? promoDraft.products.split(',').map((tag) => tag.trim()).filter(Boolean) : [])],
    }, { ownerId: effectiveUserId, actorId: currentUser.id });

    updatePromotionMeta(created.id, {
      status: initialPromotionStatus,
      startDate: promoDraft.startDate,
      endDate: promoDraft.endDate,
      couponCode: promoDraft.kind === 'coupon' ? promoDraft.couponCode : '',
      audience: promoDraft.audience,
      maxPeople: promoDraft.maxPeople,
      products: promoDraft.products,
      howItWorks: promoDraft.howItWorks,
      economicNote: promoDraft.discount,
    });
    updateProject(
      created.id,
      { promotionKind: promoDraft.kind, promotionStatus: initialPromotionStatus },
      `Promoción registrada como ${promoStatusLabel(initialPromotionStatus).toLowerCase()}`,
    );

    if (heidyUser?.id && heidyUser.id !== effectiveUserId) {
      updateProject(
        created.id,
        { participants: [heidyUser.id] },
        'Validación financiera solicitada automáticamente a Heidy',
      );
      await createMention({
        title: `Validar viabilidad · ${created.name}`,
        originType: 'project',
        originId: created.id,
        originLabel: created.name,
        objectPath: `/projects?project=${created.id}`,
        targetUserId: heidyUser.id,
        mentionType: 'validar',
        context: [
          `Validar si este ${kindLabel.toLowerCase()} es viable contable/financieramente.`,
          promoDraft.discount ? `Condición económica: ${promoDraft.discount}` : '',
          promoDraft.audience ? `Dirigido a: ${promoDraft.audience}` : '',
          promoDraft.maxPeople ? `Válido para: ${promoDraft.maxPeople}` : '',
          promoDraft.startDate || promoDraft.endDate ? `Vigencia: ${promoDraft.startDate || 'sin inicio'} → ${promoDraft.endDate || 'sin fin'}` : '',
        ].filter(Boolean).join('\n'),
      });
    }

    if (promoDraft.mentionTargetUserId) {
      updateProject(
        created.id,
        { participants: [promoDraft.mentionTargetUserId] },
        `Mención ${mentionTypeLabel(promoDraft.mentionType).toLowerCase()} creada desde promociones`,
      );
      await createMention({
        title: `${mentionTypeLabel(promoDraft.mentionType)} · ${created.name}`,
        originType: 'project',
        originId: created.id,
        originLabel: created.name,
        objectPath: `/projects?project=${created.id}`,
        targetUserId: promoDraft.mentionTargetUserId,
        mentionType: promoDraft.mentionType,
        context: promoDraft.mentionContext.trim() || `Revisar ${kindLabel.toLowerCase()}: ${created.name}`,
      });
    }

    setPromoDraft({
      kind: 'coupon',
      name: '',
      reason: '',
      audience: '',
      maxPeople: '',
      products: '',
      couponCode: '',
      discount: '',
      startDate: '',
      endDate: '',
      howItWorks: '',
      status: 'in_review',
      mentionTargetUserId: '',
      mentionType: 'consultar',
      mentionContext: '',
    });
  };

  const handleUpdatePromotionStatus = (project: { id: string }, status: PromotionOperationalStatus) => {
    updatePromotionMeta(project.id, { status });
    updateProject(
      project.id,
      { promotionStatus: status },
      `Estado operativo de cupón/promoción: ${promoStatusLabel(status)}`,
    );
  };

  const switchView = (view: FinanceView) => {
    if (!allowedViews.includes(view)) return;
    setSearchParams({ view });
  };

  const metricCards = isOperationsContext
    ? [
      { icon: Tags, label: 'Promos activas', value: String(promotionCounts.active || 0), tone: 'emerald' as const },
      { icon: CalendarDays, label: 'Programadas', value: String(promotionCounts.scheduled || 0), tone: 'sky' as const },
      { icon: BriefcaseBusiness, label: 'Proyectos Esteban', value: String(estebanProjectRows.length), tone: 'amber' as const },
      { icon: FileText, label: 'Informes operación', value: String(visibleCurrentMonthReports.length), tone: 'violet' as const },
    ]
    : [
      { icon: Tags, label: 'Promos activas', value: String(promotionCounts.active || 0), tone: 'emerald' as const },
      { icon: CalendarDays, label: 'Programadas', value: String(promotionCounts.scheduled || 0), tone: 'sky' as const },
      { icon: ShoppingCart, label: 'Compras pendientes', value: String(pendingPurchases.length), tone: 'amber' as const },
      { icon: FileText, label: 'Informes del mes', value: String(visibleCurrentMonthReports.length), tone: 'violet' as const },
    ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <header className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">
              {isOperationsContext ? 'Operaciones' : 'Finanzas operativas'}
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">{viewTitle(activeView)}</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              {isOperationsContext
                ? 'Este espacio muestra solo promociones y los informes propios de Esteban: Sistemas / Analytics y Operaciones / Proyectos.'
                : 'Promociones e informes viven separados. Las promociones nacen como proyectos tipo Cupón / Promoción; los informes son registros mensuales o de área.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {allowedViews.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => switchView(view)}
                className={classNames(
                  'rounded-xl border px-3 py-2 text-xs font-black',
                  activeView === view ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {viewTitle(view)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} tone={metric.tone} />
        ))}
      </section>

      {activeView === 'promociones' && (
        <PromotionsView
          promoDraft={promoDraft}
          setPromoDraft={setPromoDraft}
          promotionProjects={promotionProjects}
          promotionMetaByProjectId={promotionMetaByProjectId}
          updatePromotionMeta={updatePromotionMeta}
          updatePromotionStatus={handleUpdatePromotionStatus}
          handleCreatePromotion={handleCreatePromotion}
          navigate={navigate}
        />
      )}

      {activeView === 'informes' && isOperationsContext && (
        <OperationsReportsView
          monthKey={monthKey}
          setMonthKey={setMonthKey}
          currentMonthReports={visibleCurrentMonthReports}
          estebanProjectRows={estebanProjectRows}
          handleGenerateSystemsReport={handleGenerateSystemsReport}
          handleGenerateOperationsProjectsReport={handleGenerateOperationsProjectsReport}
          upsertMonthlyReport={upsertMonthlyReport}
          deleteMonthlyReport={deleteMonthlyReport}
        />
      )}

      {activeView === 'informes' && isSalesContext && (
        <SalesReportsView
          monthKey={monthKey}
          setMonthKey={setMonthKey}
          currentMonthReports={visibleCurrentMonthReports}
          handleGenerateSalesClosingReport={handleGenerateSalesClosingReport}
          upsertMonthlyReport={upsertMonthlyReport}
          deleteMonthlyReport={deleteMonthlyReport}
        />
      )}

      {activeView === 'informes' && isWarehouseContext && (
        <WarehouseReportsView
          monthKey={monthKey}
          setMonthKey={setMonthKey}
          currentMonthReports={visibleCurrentMonthReports}
          handleGenerateInventoryReport={handleGenerateInventoryReport}
          upsertMonthlyReport={upsertMonthlyReport}
          deleteMonthlyReport={deleteMonthlyReport}
        />
      )}

      {activeView === 'informes' && !isOperationsContext && !isSalesContext && !isWarehouseContext && (
        <ReportsView
          monthKey={monthKey}
          setMonthKey={setMonthKey}
          reportDraft={reportDraft}
          setReportDraft={setReportDraft}
          currentMonthReports={visibleCurrentMonthReports}
          handleSaveReport={handleSaveReport}
          handleGenerateAreaReport={handleGenerateAreaReport}
          reportTypes={isFinanceContext ? HEIDY_REPORT_TYPES : REPORT_TYPES}
          requiredReportTypes={isFinanceContext ? HEIDY_REPORT_TYPES : undefined}
          isFinanceContext={isFinanceContext}
        />
      )}

      {activeView === 'compras' && <PurchasesView shoppingItems={shoppingItems} navigate={navigate} />}

      {activeView === 'costes' && <ProjectCostsView projectCostRows={projectCostRows} navigate={navigate} />}
    </div>
  );
}

function PromotionsView({
  promoDraft,
  setPromoDraft,
  promotionProjects,
  promotionMetaByProjectId,
  updatePromotionMeta,
  updatePromotionStatus,
  handleCreatePromotion,
  navigate,
}: {
  promoDraft: any;
  setPromoDraft: React.Dispatch<React.SetStateAction<any>>;
  promotionProjects: any[];
  promotionMetaByProjectId: Record<string, any>;
  updatePromotionMeta: (projectId: string, patch: any) => void;
  updatePromotionStatus: (project: { id: string }, status: PromotionOperationalStatus) => void;
  handleCreatePromotion: (event: React.FormEvent) => void;
  navigate: (path: string) => void;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={handleCreatePromotion} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-violet-700" />
          <h2 className="text-xl font-black text-slate-950">Crear cupón o promoción</h2>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Esto crea una propuesta tipo Cupón / Promoción y la envía automáticamente a Heidy para validar viabilidad financiera.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { key: 'coupon', label: 'Cupón' },
            { key: 'promotion', label: 'Promoción' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPromoDraft((prev: any) => ({ ...prev, kind: option.key }))}
              className={classNames(
                'rounded-xl border px-3 py-2 text-sm font-black',
                promoDraft.kind === option.key ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-600',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          <input value={promoDraft.name} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, name: event.target.value }))} placeholder="Nombre" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <textarea value={promoDraft.reason} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, reason: event.target.value }))} placeholder="Por qué se hace / idea de fondo" className="min-h-[76px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          <input value={promoDraft.audience} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, audience: event.target.value }))} placeholder="Aplicable para quiénes" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <input value={promoDraft.maxPeople} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, maxPeople: event.target.value }))} placeholder="Para cuánta gente / límite de uso" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <input value={promoDraft.products} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, products: event.target.value }))} placeholder="Productos / tags separados por coma" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          {promoDraft.kind === 'coupon' && (
            <input value={promoDraft.couponCode} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, couponCode: event.target.value }))} placeholder="Código de cupón" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          )}
          <input value={promoDraft.discount} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, discount: event.target.value }))} placeholder="Descuento / condición económica" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={promoDraft.startDate} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, startDate: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
            <input type="date" value={promoDraft.endDate} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, endDate: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          </div>
          <select value={promoDraft.status} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, status: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
            <option value="in_review">En revisión</option>
            <option value="scheduled">Programada</option>
            <option value="active">Activa</option>
            <option value="finished">Finalizada</option>
          </select>
          <textarea value={promoDraft.howItWorks} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, howItWorks: event.target.value }))} placeholder="Cómo funciona" className="min-h-[76px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
        </div>

        <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">Mención opcional</p>
          <div className="mt-3 grid gap-2">
            <select value={promoDraft.mentionTargetUserId} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, mentionTargetUserId: event.target.value }))} className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm font-bold">
              <option value="">Sin mención</option>
              {USERS.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <select value={promoDraft.mentionType} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, mentionType: event.target.value }))} className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm font-bold">
              {MENTION_TYPES.map((type) => <option key={type} value={type}>{mentionTypeLabel(type)}</option>)}
            </select>
            <textarea value={promoDraft.mentionContext} onChange={(event) => setPromoDraft((prev: any) => ({ ...prev, mentionContext: event.target.value }))} placeholder="Contexto de la mención" className="min-h-[68px] rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm font-semibold" />
          </div>
        </div>

        <button type="submit" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white hover:bg-violet-800">
          <Plus size={16} /> Crear
        </button>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Cupones y promociones</h2>
            <p className="text-sm font-semibold text-slate-500">Registro operativo derivado de proyectos.</p>
          </div>
          <button type="button" onClick={() => navigate('/projects')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
            Ir a proyectos
          </button>
        </div>
        <div className="space-y-3">
          {promotionProjects.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
              Todavía no hay proyectos tipo Cupón / Promoción visibles.
            </p>
          )}
          {promotionProjects.map((project) => {
            const progress = calculateProjectProgress(project);
            const meta = promotionMetaByProjectId[project.id];
            const status = projectPromotionStatus(project, meta);
            return (
              <article key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={classNames('rounded-full border px-3 py-1 text-xs font-black', promoStatusClass(status))}>{promoStatusLabel(status)}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600">{projectStatusLabel(project.status)}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-black text-slate-950">{project.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{project.objective || project.description || 'Sin descripción'}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">{progress.completed}% completado · responsable {userName(project.responsibleId)}</p>
                  </div>
                  <select value={status} onChange={(event) => updatePromotionStatus(project, event.target.value as PromotionOperationalStatus)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
                    <option value="in_review">En revisión</option>
                    <option value="scheduled">Programado</option>
                    <option value="active">Activo</option>
                    <option value="finished">Finalizado</option>
                  </select>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <input value={meta?.couponCode || ''} onChange={(event) => updatePromotionMeta(project.id, { couponCode: event.target.value })} placeholder="Código/cupón" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                  <input type="date" value={meta?.startDate || ''} onChange={(event) => updatePromotionMeta(project.id, { startDate: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                  <input type="date" value={meta?.endDate || ''} onChange={(event) => updatePromotionMeta(project.id, { endDate: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                  <input value={meta?.audience || ''} onChange={(event) => updatePromotionMeta(project.id, { audience: event.target.value })} placeholder="A quién aplica" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                  <input value={meta?.maxPeople || ''} onChange={(event) => updatePromotionMeta(project.id, { maxPeople: event.target.value })} placeholder="Límite de uso / personas" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                  <input value={meta?.products || ''} onChange={(event) => updatePromotionMeta(project.id, { products: event.target.value })} placeholder="Productos" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                  <input value={meta?.economicNote || ''} onChange={(event) => updatePromotionMeta(project.id, { economicNote: event.target.value })} placeholder="Nota económica" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                </div>
                <textarea value={meta?.howItWorks || ''} onChange={(event) => updatePromotionMeta(project.id, { howItWorks: event.target.value })} placeholder="Cómo funciona" className="mt-2 min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function OperationsReportsView({
  monthKey,
  setMonthKey,
  currentMonthReports,
  estebanProjectRows,
  handleGenerateSystemsReport,
  handleGenerateOperationsProjectsReport,
  upsertMonthlyReport,
  deleteMonthlyReport,
}: {
  monthKey: string;
  setMonthKey: (value: string) => void;
  currentMonthReports: any[];
  estebanProjectRows: any[];
  handleGenerateSystemsReport: () => void;
  handleGenerateOperationsProjectsReport: () => void;
  upsertMonthlyReport: (report: {
    id?: string;
    monthKey: string;
    title: string;
    reportType: ReportType;
    notes?: string;
    attachments: Attachment[];
  }) => void;
  deleteMonthlyReport: (reportId: string) => void;
}) {
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', notes: '' });
  const [systemDraft, setSystemDraft] = useState<Record<string, string>>({
    entradas: '',
    traspasos: '',
    ensamblajes: '',
    stock: '',
    ventas: '',
    diferencias: '',
    productoMasVendido: '',
    productoMenosVendido: '',
    variacion: '',
    comentario: '',
  });
  const activeProjects = estebanProjectRows.filter((project) => project.status === 'in_progress' || project.weeklyPriorityRank);

  const startEditingReport = (report: any) => {
    setEditingReportId(report.id);
    setEditDraft({ title: report.title || '', notes: report.notes || '' });
  };

  const saveEditingReport = (report: any) => {
    if (!editDraft.title.trim()) return;
    upsertMonthlyReport({
      id: report.id,
      monthKey: report.monthKey,
      title: editDraft.title.trim(),
      reportType: report.reportType,
      notes: editDraft.notes,
      attachments: report.attachments || [],
    });
    setEditingReportId(null);
    setEditDraft({ title: '', notes: '' });
  };

  const removeReport = (report: any) => {
    if (typeof window !== 'undefined' && !window.confirm(`Eliminar "${report.title}"?`)) return;
    deleteMonthlyReport(report.id);
    if (editingReportId === report.id) {
      setEditingReportId(null);
      setEditDraft({ title: '', notes: '' });
    }
  };

  const saveSystemsReport = () => {
    upsertMonthlyReport({
      monthKey,
      title: `Informe sistemas / analytics · ${monthKey}`,
      reportType: 'sistemas_analytics',
      notes: [
        'Informe de Esteban · Operaciones / Sistemas',
        '',
        'SISTEMAS / ANALYTICS',
        ...SYSTEMS_REPORT_FIELDS.map((field) => `${field.label}: ${systemDraft[field.key] || 'Pendiente de completar'}`),
        '',
        'Comentario sistemas/analytics:',
        systemDraft.comentario || 'Pendiente de completar',
      ].join('\n'),
      attachments: [],
    });
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ReceiptText size={18} className="text-emerald-700" />
          <h2 className="text-xl font-black text-slate-950">Informes de Esteban</h2>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Aquí no aparecen solicitudes de compra ni proyectos y costes. Solo informes propios de Operaciones.
        </p>
        <div className="mt-4 space-y-3">
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value || currentMonthKey())}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Sistemas / Analytics</p>
            <p className="mt-1 text-xs font-semibold text-emerald-900/70">Campos manuales para que Esteban complete el informe sin escribir una tabla larga.</p>
            <div className="mt-3 grid gap-2">
              {SYSTEMS_REPORT_FIELDS.map((field) => (
                <label key={field.key} className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{field.label}</span>
                  <input
                    value={systemDraft[field.key]}
                    onChange={(event) => setSystemDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
                    className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                    placeholder="Completar..."
                  />
                </label>
              ))}
              <textarea
                value={systemDraft.comentario}
                onChange={(event) => setSystemDraft((prev) => ({ ...prev, comentario: event.target.value }))}
                className="min-h-[76px] w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                placeholder="Comentario sistemas/analytics"
              />
            </div>
            <button
              type="button"
              onClick={saveSystemsReport}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-black text-white hover:bg-emerald-800"
            >
              <CheckCircle2 size={16} /> Guardar Sistemas / Analytics
            </button>
          </div>
          <button
            type="button"
            onClick={handleGenerateOperationsProjectsReport}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800 hover:bg-emerald-100"
          >
            <BriefcaseBusiness size={16} /> Generar operaciones y proyectos
          </button>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Resumen rápido</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-bold text-slate-700">
            <div>
              <p className="text-2xl font-black text-slate-950">{estebanProjectRows.length}</p>
              <p>Proyectos en cartera</p>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-950">{activeProjects.length}</p>
              <p>En foco / activos</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Informes de operaciones · {monthKey}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {currentMonthReports.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500 md:col-span-2">
              Todavía no hay informes de Esteban guardados para este mes.
            </p>
          )}
          {currentMonthReports.map((report) => (
            <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              {editingReportId === report.id ? (
                <div className="space-y-3">
                  <input
                    value={editDraft.title}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950"
                  />
                  <textarea
                    value={editDraft.notes}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, notes: event.target.value }))}
                    className="min-h-[260px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => saveEditingReport(report)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800"
                    >
                      <Save size={14} /> Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingReportId(null);
                        setEditDraft({ title: '', notes: '' });
                      }}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                    >
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{report.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {REPORT_TYPES.find((type) => type.key === report.reportType)?.label} · {report.attachments.length} adjunto(s)
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => startEditingReport(report)}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
                        title="Editar informe"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeReport(report)}
                        className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50"
                        title="Eliminar informe"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {report.notes && <p className="mt-3 whitespace-pre-line text-sm font-semibold text-slate-600">{report.notes}</p>}
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function SalesReportsView({
  monthKey,
  setMonthKey,
  currentMonthReports,
  handleGenerateSalesClosingReport,
  upsertMonthlyReport,
  deleteMonthlyReport,
}: {
  monthKey: string;
  setMonthKey: (value: string) => void;
  currentMonthReports: any[];
  handleGenerateSalesClosingReport: () => void;
  upsertMonthlyReport: (report: {
    id?: string;
    monthKey: string;
    title: string;
    reportType: ReportType;
    notes?: string;
    attachments: Attachment[];
  }) => void;
  deleteMonthlyReport: (reportId: string) => void;
}) {
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', notes: '' });

  const startEditingReport = (report: any) => {
    setEditingReportId(report.id);
    setEditDraft({ title: report.title || '', notes: report.notes || '' });
  };

  const saveEditingReport = (report: any) => {
    if (!editDraft.title.trim()) return;
    upsertMonthlyReport({
      id: report.id,
      monthKey: report.monthKey,
      title: editDraft.title.trim(),
      reportType: report.reportType,
      notes: editDraft.notes,
      attachments: report.attachments || [],
    });
    setEditingReportId(null);
    setEditDraft({ title: '', notes: '' });
  };

  const removeReport = (report: any) => {
    if (typeof window !== 'undefined' && !window.confirm(`Eliminar "${report.title}"?`)) return;
    deleteMonthlyReport(report.id);
    if (editingReportId === report.id) {
      setEditingReportId(null);
      setEditDraft({ title: '', notes: '' });
    }
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ReceiptText size={18} className="text-pink-700" />
          <h2 className="text-xl font-black text-slate-950">Informes de Itzi</h2>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Genera el informe de control operativo de cierre de mes. Al guardarse, aparece también en la lista de informes de Dirección.
        </p>
        <div className="mt-4 space-y-3">
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value || currentMonthKey())}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <button
            type="button"
            onClick={handleGenerateSalesClosingReport}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-700 px-3 py-2 text-sm font-black text-white hover:bg-pink-800"
          >
            <CheckCircle2 size={16} /> Generar cierre operativo
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Informes de ventas · {monthKey}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {currentMonthReports.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500 md:col-span-2">
              Todavía no hay informes de ventas guardados para este mes.
            </p>
          )}
          {currentMonthReports.map((report) => (
            <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              {editingReportId === report.id ? (
                <div className="space-y-3">
                  <input
                    value={editDraft.title}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950"
                  />
                  <textarea
                    value={editDraft.notes}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, notes: event.target.value }))}
                    className="min-h-[260px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => saveEditingReport(report)} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800">
                      <Save size={14} /> Guardar
                    </button>
                    <button type="button" onClick={() => setEditingReportId(null)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{report.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {REPORT_TYPES.find((type) => type.key === report.reportType)?.label} · {report.attachments.length} adjunto(s)
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => startEditingReport(report)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100" title="Editar informe">
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => removeReport(report)} className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50" title="Eliminar informe">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {report.notes && <p className="mt-3 whitespace-pre-line text-sm font-semibold text-slate-600">{report.notes}</p>}
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function WarehouseReportsView({
  monthKey,
  setMonthKey,
  currentMonthReports,
  handleGenerateInventoryReport,
  upsertMonthlyReport,
  deleteMonthlyReport,
}: {
  monthKey: string;
  setMonthKey: (value: string) => void;
  currentMonthReports: any[];
  handleGenerateInventoryReport: () => void;
  upsertMonthlyReport: (report: {
    id?: string;
    monthKey: string;
    title: string;
    reportType: ReportType;
    notes?: string;
    attachments: Attachment[];
  }) => void;
  deleteMonthlyReport: (reportId: string) => void;
}) {
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', notes: '' });

  const startEditingReport = (report: any) => {
    setEditingReportId(report.id);
    setEditDraft({ title: report.title || '', notes: report.notes || '' });
  };

  const saveEditingReport = (report: any) => {
    if (!editDraft.title.trim()) return;
    upsertMonthlyReport({
      id: report.id,
      monthKey: report.monthKey,
      title: editDraft.title.trim(),
      reportType: report.reportType,
      notes: editDraft.notes,
      attachments: report.attachments || [],
    });
    setEditingReportId(null);
    setEditDraft({ title: '', notes: '' });
  };

  const removeReport = (report: any) => {
    if (typeof window !== 'undefined' && !window.confirm(`Eliminar "${report.title}"?`)) return;
    deleteMonthlyReport(report.id);
    if (editingReportId === report.id) {
      setEditingReportId(null);
      setEditDraft({ title: '', notes: '' });
    }
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ReceiptText size={18} className="text-sky-700" />
          <h2 className="text-xl font-black text-slate-950">Informes de inventario</h2>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Genera el informe mensual de inventario por lote. Al guardarse, aparece también en informes de Dirección.
        </p>
        <div className="mt-4 space-y-3">
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value || currentMonthKey())}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <button
            type="button"
            onClick={handleGenerateInventoryReport}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-black text-white hover:bg-sky-800"
          >
            <CheckCircle2 size={16} /> Generar informe de inventario
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Inventario · {monthKey}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {currentMonthReports.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500 md:col-span-2">
              Todavía no hay informes de inventario guardados para este mes.
            </p>
          )}
          {currentMonthReports.map((report) => (
            <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              {editingReportId === report.id ? (
                <div className="space-y-3">
                  <input
                    value={editDraft.title}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-950"
                  />
                  <textarea
                    value={editDraft.notes}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, notes: event.target.value }))}
                    className="min-h-[260px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => saveEditingReport(report)} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800">
                      <Save size={14} /> Guardar
                    </button>
                    <button type="button" onClick={() => setEditingReportId(null)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{report.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {REPORT_TYPES.find((type) => type.key === report.reportType)?.label} · {report.attachments.length} adjunto(s)
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => startEditingReport(report)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100" title="Editar informe">
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => removeReport(report)} className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50" title="Eliminar informe">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {report.notes && <p className="mt-3 max-h-[360px] overflow-auto whitespace-pre-line text-sm font-semibold text-slate-600">{report.notes}</p>}
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function ReportsView({
  monthKey,
  setMonthKey,
  reportDraft,
  setReportDraft,
  currentMonthReports,
  handleSaveReport,
  handleGenerateAreaReport,
  reportTypes = REPORT_TYPES,
  requiredReportTypes,
  isFinanceContext = false,
}: {
  monthKey: string;
  setMonthKey: (value: string) => void;
  reportDraft: { title: string; reportType: ReportType; notes: string; attachments: Attachment[] };
  setReportDraft: React.Dispatch<React.SetStateAction<{ title: string; reportType: ReportType; notes: string; attachments: Attachment[] }>>;
  currentMonthReports: any[];
  handleSaveReport: (event: React.FormEvent) => void;
  handleGenerateAreaReport: () => void;
  reportTypes?: ReadonlyArray<{ key: ReportType; label: string }>;
  requiredReportTypes?: ReadonlyArray<{ key: ReportType; label: string }>;
  isFinanceContext?: boolean;
}) {
  useEffect(() => {
    if (!reportTypes.some((type) => type.key === reportDraft.reportType)) {
      setReportDraft((prev) => ({ ...prev, reportType: reportTypes[0]?.key || 'otros' }));
    }
  }, [reportDraft.reportType, reportTypes, setReportDraft]);

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={handleSaveReport} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ReceiptText size={18} className="text-violet-700" />
          <h2 className="text-xl font-black text-slate-950">{isFinanceContext ? 'Informes de Heidy' : 'Subir informe'}</h2>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {isFinanceContext
            ? 'Sube los tres informes financieros del mes. Al guardarlos, aparecen tambien en la vista de informes de Direccion.'
            : 'Informes mensuales o de área. Lo que cada persona genere puede aparecer aquí para Dirección.'}
        </p>
        {requiredReportTypes && (
          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-violet-700">Checklist del mes</p>
            <div className="mt-2 space-y-2">
              {requiredReportTypes.map((type) => {
                const isUploaded = currentMonthReports.some((report) => report.reportType === type.key);
                return (
                  <div key={type.key} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm font-bold">
                    <span className="text-slate-700">{type.label}</span>
                    <span className={classNames('rounded-full px-2 py-1 text-[11px] font-black', isUploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {isUploaded ? 'Subido' : 'Pendiente'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-4 space-y-3">
          <input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value || currentMonthKey())} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <input value={reportDraft.title} onChange={(event) => setReportDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título del informe" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <select value={reportDraft.reportType} onChange={(event) => setReportDraft((prev) => ({ ...prev, reportType: event.target.value as typeof REPORT_TYPES[number]['key'] }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
            {reportTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
          </select>
          <textarea value={reportDraft.notes} onChange={(event) => setReportDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notas, resumen o contexto" className="min-h-[92px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          <FileUploader
            folderPath={`finance-reports/${monthKey}`}
            existingFiles={reportDraft.attachments}
            onUploadComplete={(files) => setReportDraft((prev) => ({ ...prev, attachments: files }))}
            compact
            maxSizeMB={20}
          />
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white hover:bg-violet-800">
            <Send size={16} /> Guardar informe
          </button>
          {!isFinanceContext && (
            <button type="button" onClick={handleGenerateAreaReport} className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-black text-violet-800 hover:bg-violet-100">
              Generar borrador de mi área
            </button>
          )}
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Informes de {monthKey}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {currentMonthReports.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500 md:col-span-2">
              No hay informes guardados para este mes.
            </p>
          )}
          {currentMonthReports.map((report) => (
            <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">{report.title}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {REPORT_TYPES.find((type) => type.key === report.reportType)?.label} · {report.attachments.length} adjunto(s)
              </p>
              {report.notes && <p className="mt-3 whitespace-pre-line text-sm font-semibold text-slate-600">{report.notes}</p>}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function PurchasesView({ shoppingItems, navigate }: { shoppingItems: any[]; navigate: (path: string) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ShoppingCart size={18} className="text-violet-700" />
        <h2 className="text-xl font-black text-slate-950">Solicitudes de compra</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shoppingItems.map((item) => {
          const status = purchaseStatus(item);
          return (
            <button key={item.id} type="button" onClick={() => navigate('/shopping')} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">{item.name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{item.location.toUpperCase()} · pidió {userName(item.created_by)}</p>
                </div>
                <span className={classNames('rounded-full border px-2 py-0.5 text-[11px] font-black', status.className)}>{status.label}</span>
              </div>
            </button>
          );
        })}
        {shoppingItems.length === 0 && <p className="text-sm font-semibold text-slate-500">No hay solicitudes de compra.</p>}
      </div>
    </section>
  );
}

function ProjectCostsView({ projectCostRows, navigate }: { projectCostRows: any[]; navigate: (path: string) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <BriefcaseBusiness size={18} className="text-violet-700" />
        <h2 className="text-xl font-black text-slate-950">Proyectos y costes</h2>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-500">Solo proyectos visibles para ti o donde estás involucrada.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projectCostRows.map((project) => {
          const progress = calculateProjectProgress(project);
          return (
            <button key={project.id} type="button" onClick={() => navigate(`/projects?project=${project.id}`)} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white">
              <p className="text-sm font-black text-slate-950">{project.name}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{projectTypeLabel(project.type)} · {projectStatusLabel(project.status)}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${progress.completed}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: 'emerald' | 'sky' | 'amber' | 'violet' }) {
  const classes = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
  }[tone];
  return (
    <div className={classNames('rounded-2xl border p-4 shadow-sm', classes)}>
      <Icon size={20} />
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="text-xs font-black uppercase tracking-wide">{label}</p>
    </div>
  );
}
