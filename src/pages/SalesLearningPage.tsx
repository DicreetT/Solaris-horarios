import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArrowRight, BookOpen, CheckCircle2, FolderKanban, HelpCircle, Lightbulb, Plus, Radar, RotateCcw, Save, Tags, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CommercialNeedRecord, FaqRecord, StudentSupportRecord, useSalesLearning } from '../hooks/useSalesLearning';
import { useProjects } from '../hooks/useProjects';
import { parseTagInput } from '../utils/mentionsAndTags';

const PRODUCT_OPTIONS = [
  { code: 'SV', label: 'Solar Vital' },
  { code: 'ENT', label: 'Entero Vital' },
  { code: 'RG', label: 'Regenerio' },
  { code: 'AV', label: 'Aviro Vital' },
  { code: 'MV', label: 'Maviro' },
  { code: 'ISO', label: 'Isotonic' },
  { code: 'DP', label: 'Digestivo' },
  { code: 'SP', label: 'Sales de Prana' },
];

function splitTags(value: string) {
  return parseTagInput(value);
}

function normalizeRadarTag(value: string) {
  return value
    .replace(/^#/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

function tagDisplay(value: string) {
  const clean = value.replace(/^#/, '').trim();
  return clean ? `#${clean}` : '';
}

function tagSummary(items: Array<{ tags?: string[] }>) {
  const counts = new Map<string, { display: string; count: number }>();
  items.forEach((item) => (item.tags || []).forEach((tag) => {
    const key = normalizeRadarTag(tag);
    const display = tagDisplay(tag);
    if (!key || !display) return;
    const current = counts.get(key);
    counts.set(key, { display: current?.display || display, count: (current?.count || 0) + 1 });
  }));
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((item) => [item.display, item.count] as [string, number]);
}

function supportTypeLabel(type: StudentSupportRecord['type']) {
  if (type === 'access') return 'Acceso';
  if (type === 'content') return 'Contenido';
  if (type === 'functionality') return 'Funcionamiento';
  return 'Otro';
}

function faqGroupLabel(group: FaqRecord['group']) {
  return group === 'formations' ? 'Formaciones' : 'Producto / empresa';
}

function needStatusLabel(status: CommercialNeedRecord['status']) {
  if (status === 'opportunity') return 'Oportunidad';
  if (status === 'project_proposed') return 'Propuesta/proyecto';
  if (status === 'resolved') return 'Solventada';
  if (status === 'archived') return 'Archivada';
  return 'Necesidad detectada';
}

function needStatusClass(status: CommercialNeedRecord['status']) {
  if (status === 'opportunity') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'project_proposed') return 'border-teal-200 bg-teal-50 text-teal-700';
  if (status === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'archived') return 'border-slate-200 bg-slate-50 text-slate-500';
  return 'border-orange-200 bg-orange-50 text-orange-700';
}

export default function SalesLearningPage() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get('view') || (currentUser?.isAdmin ? 'direction' : 'sales');
  const canManageFormations = viewMode === 'direction' && !!currentUser?.isAdmin;
  const isSalesSupportView = viewMode === 'sales';
  const isCommercialNotebookView = viewMode === 'commercial';
  const isFaqNotebookView = viewMode === 'faqs';
  const isActiveInfoView = viewMode === 'active';
  const {
    formations,
    activeFormations,
    support,
    pendingSupport,
    needs,
    faqs,
    createFormation,
    updateFormation,
    updateFormationStatus,
    deleteFormation,
    createSupport,
    updateSupportStatus,
    createNeed,
    updateNeed,
    createFaq,
    updateFaqStatus,
    syncSalesLearningNow,
  } = useSalesLearning(currentUser);
  const { createProject } = useProjects(currentUser);

  const [formationDraft, setFormationDraft] = useState({
    name: '',
    objective: '',
    purpose: '',
    duration: '',
    teacher: '',
    audienceSize: '',
    tools: '',
    resources: '',
    ideas: '',
    structure: '',
    status: 'draft' as const,
  });
  const [supportDraft, setSupportDraft] = useState({
    formationId: '',
    student: '',
    query: '',
    type: 'access' as StudentSupportRecord['type'],
    tags: '',
    notes: '',
  });
  const [needDraft, setNeedDraft] = useState({
    detected: '',
    context: '',
    product: '',
    frequency: '',
    tags: '',
    solution: '',
  });
  const [faqDraft, setFaqDraft] = useState({
    group: 'products' as FaqRecord['group'],
    formationId: '',
    product: '',
    question: '',
    answer: '',
    tags: '',
  });
  const [selectedFormationId, setSelectedFormationId] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  const supportTags = useMemo(() => tagSummary(support), [support]);
  const activeCommercialSignals = useMemo(() => (
    needs.filter((need) => !['resolved', 'archived'].includes(need.status))
  ), [needs]);
  const closedCommercialSignals = useMemo(() => (
    needs.filter((need) => ['resolved', 'archived'].includes(need.status))
  ), [needs]);
  const needTags = useMemo(() => tagSummary(activeCommercialSignals), [activeCommercialSignals]);
  const pendingFaqs = faqs.filter((faq) => faq.status !== 'published');
  const opportunities = activeCommercialSignals.filter((need) => need.status === 'opportunity' || need.status === 'project_proposed');
  const commercialStages = useMemo(() => ([
    {
      key: 'need' as const,
      title: '1. Necesidades detectadas',
      hint: 'Lo que aparece en conversaciones, dudas, objeciones o señales de clientes.',
      items: activeCommercialSignals.filter((need) => need.status === 'need'),
    },
    {
      key: 'opportunity' as const,
      title: '2. Oportunidades',
      hint: 'Señales con potencial comercial o propuesta de solución inicial.',
      items: activeCommercialSignals.filter((need) => need.status === 'opportunity'),
    },
    {
      key: 'project_proposed' as const,
      title: '3. Propuestas / proyectos',
      hint: 'Ya se organizó como propuesta accionable o proyecto creado.',
      items: activeCommercialSignals.filter((need) => need.status === 'project_proposed'),
    },
  ]), [activeCommercialSignals]);
  const topProductSignals = useMemo(() => {
    const counts = new Map<string, number>();
    activeCommercialSignals.forEach((need) => {
      const product = need.product || 'Sin producto';
      counts.set(product, (counts.get(product) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [activeCommercialSignals]);
  const commonCommercialFoci = useMemo(() => {
    const byTag = new Map<string, { display: string; items: CommercialNeedRecord[] }>();
    activeCommercialSignals.forEach((need) => {
      const seenInNeed = new Set<string>();
      (need.tags || []).forEach((tag) => {
        const key = normalizeRadarTag(tag);
        const display = tagDisplay(tag);
        if (!key || !display || seenInNeed.has(key)) return;
        seenInNeed.add(key);
        const current = byTag.get(key) || { display, items: [] };
        current.items.push(need);
        byTag.set(key, current);
      });
    });
    return [...byTag.values()]
      .filter((focus) => focus.items.length >= 2)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 6);
  }, [activeCommercialSignals]);
  const selectedFormation = useMemo(() => (
    formations.find((formation) => formation.id === selectedFormationId)
    || activeFormations[0]
    || formations[0]
    || null
  ), [activeFormations, formations, selectedFormationId]);

  useEffect(() => {
    if (!canManageFormations) return;
    if (!selectedFormationId && selectedFormation?.id) {
      setSelectedFormationId(selectedFormation.id);
      return;
    }
    if (selectedFormationId && !formations.some((formation) => formation.id === selectedFormationId)) {
      setSelectedFormationId(activeFormations[0]?.id || formations[0]?.id || '');
    }
  }, [activeFormations, canManageFormations, formations, selectedFormation?.id, selectedFormationId]);

  const handleCreateFormation = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formationDraft.name.trim()) return;
    const created = createFormation(formationDraft);
    setSelectedFormationId(created.id);
    setFormationDraft({ name: '', objective: '', purpose: '', duration: '', teacher: '', audienceSize: '', tools: '', resources: '', ideas: '', structure: '', status: 'draft' });
  };

  const handleSyncFormations = async () => {
    setSyncMessage('Sincronizando...');
    try {
      const synced = await syncSalesLearningNow();
      const activeCount = synced.formations.filter((formation) => !formation.deletedAt && formation.status === 'active').length;
      setSyncMessage(`${activeCount} formación(es) activas sincronizadas.`);
    } catch {
      setSyncMessage('No se pudo sincronizar. Revisa conexión y vuelve a intentar.');
    }
  };

  const handleCreateSupport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!supportDraft.query.trim()) return;
    createSupport({
      formationId: supportDraft.formationId || undefined,
      student: supportDraft.student,
      query: supportDraft.query,
      type: supportDraft.type,
      status: 'pending',
      tags: splitTags(supportDraft.tags),
      notes: supportDraft.notes,
    });
    setSupportDraft((prev) => ({ ...prev, student: '', query: '', tags: '', notes: '' }));
  };

  const handleCreateNeed = (event: React.FormEvent) => {
    event.preventDefault();
    if (!needDraft.detected.trim()) return;
    createNeed({
      ...needDraft,
      tags: splitTags(needDraft.tags),
      status: 'need',
    });
    setNeedDraft({ detected: '', context: '', product: '', frequency: '', tags: '', solution: '' });
  };

  const handleCreateFaq = (event: React.FormEvent) => {
    event.preventDefault();
    if (!faqDraft.question.trim()) return;
    createFaq({
      ...faqDraft,
      formationId: faqDraft.formationId || undefined,
      product: faqDraft.group === 'products' ? faqDraft.product : undefined,
      tags: splitTags(faqDraft.tags),
      status: 'new',
    });
    setFaqDraft((prev) => ({ ...prev, question: '', answer: '', tags: '' }));
  };

  const promoteNeedToProject = (needId: string) => {
    const need = needs.find((item) => item.id === needId);
    if (!need || !currentUser?.id) return;
    const project = createProject({
      name: need.solution ? `Solución comercial · ${need.product || need.detected}` : `Necesidad comercial · ${need.detected}`,
      type: 'contenido',
      responsibleId: currentUser.id,
      objective: need.detected,
      description: [
        need.context ? `Contexto: ${need.context}` : '',
        need.product ? `Producto: ${need.product}` : '',
        need.frequency ? `Frecuencia: ${need.frequency}` : '',
        need.solution ? `Propuesta: ${need.solution}` : '',
      ].filter(Boolean).join('\n'),
      priority: 'medium',
      targetDate: undefined,
      expectedResult: need.solution || 'Propuesta comercial organizada y lista para validar.',
      completionDefinition: 'La necesidad tiene solución definida, responsable y siguiente paso claro.',
      tags: need.tags,
    });
    updateNeed(need.id, { status: 'project_proposed', linkedProjectId: project.id });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-pink-700">{canManageFormations ? 'Dirección · Formación' : isActiveInfoView ? 'Operaciones · Formaciones activas' : 'Ventas · Formación'}</p>
        <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">
          {canManageFormations ? 'Formación y aprendizaje' : isActiveInfoView ? 'Formaciones activas' : isCommercialNotebookView ? 'Cuaderno comercial' : isFaqNotebookView ? 'Preguntas frecuentes y soporte' : 'Formaciones activas y soporte'}
        </h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
          {isActiveInfoView
            ? 'Vista informativa para operaciones/marketing: formaciones activas, objetivo y estructura. El soporte de alumnos vive en Ventas.'
            : 'Thalia crea y activa formaciones. Itzi trabaja sobre las formaciones activas para soporte humano, preguntas frecuentes y necesidades detectadas.'}
        </p>
      </header>

      {!isActiveInfoView && !isCommercialNotebookView && !isFaqNotebookView && <section className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={BookOpen} label="Formaciones activas" value={String(activeFormations.length)} />
        <MetricCard icon={HelpCircle} label="Soporte pendiente" value={String(pendingSupport.length)} />
        <MetricCard icon={Radar} label="Necesidades" value={String(needs.length)} />
        <MetricCard icon={FolderKanban} label="Oportunidades/proyectos" value={String(opportunities.length)} />
        <MetricCard icon={Tags} label="FAQs pendientes" value={String(pendingFaqs.length)} />
      </section>}

      <section className={canManageFormations || isCommercialNotebookView || isActiveInfoView ? 'grid gap-6' : 'grid gap-6 xl:grid-cols-2'}>
        <Panel title="Formación y aprendizaje" icon={BookOpen}>
          {canManageFormations ? (
            <div className="grid gap-4">
              <form onSubmit={handleCreateFormation} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <input value={formationDraft.name} onChange={(e) => setFormationDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Título de la formación" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                <textarea value={formationDraft.objective} onChange={(e) => setFormationDraft((p) => ({ ...p, objective: e.target.value }))} placeholder="De qué trata la formación" rows={2} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={formationDraft.duration} onChange={(e) => setFormationDraft((p) => ({ ...p, duration: e.target.value }))} placeholder="Duración" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                  <input value={formationDraft.teacher} onChange={(e) => setFormationDraft((p) => ({ ...p, teacher: e.target.value }))} placeholder="Docente" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                  <input value={formationDraft.audienceSize} onChange={(e) => setFormationDraft((p) => ({ ...p, audienceSize: e.target.value }))} placeholder="Personas estimadas" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                  <input value={formationDraft.tools} onChange={(e) => setFormationDraft((p) => ({ ...p, tools: e.target.value }))} placeholder="Herramientas previstas" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                </div>
                <textarea value={formationDraft.purpose} onChange={(e) => setFormationDraft((p) => ({ ...p, purpose: e.target.value }))} placeholder="Para qué sirve" rows={2} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
                <textarea value={formationDraft.structure} onChange={(e) => setFormationDraft((p) => ({ ...p, structure: e.target.value }))} placeholder="Estructura / pasos" rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
                <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-3 py-2 text-xs font-black text-white">
                  <Plus size={14} />
                  Crear formación en borrador
                </button>
              </form>

              <div className="space-y-3 rounded-2xl border border-pink-100 bg-white p-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-pink-700">Formaciones activas</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSyncFormations}
                      className="inline-flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-xs font-black text-pink-700 hover:bg-pink-100"
                    >
                      <Save size={14} />
                      Sincronizar formaciones
                    </button>
                    {syncMessage && <span className="text-xs font-bold text-slate-500">{syncMessage}</span>}
                  </div>
                  <select
                    value={selectedFormation?.id || ''}
                    onChange={(event) => setSelectedFormationId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-800 outline-none"
                  >
                    {formations.length === 0 && <option value="">No hay formaciones todavía</option>}
                    {activeFormations.length > 0 && (
                      <optgroup label="Activas">
                        {activeFormations.map((formation) => <option key={formation.id} value={formation.id}>{formation.name}</option>)}
                      </optgroup>
                    )}
                    {formations.filter((formation) => formation.status !== 'active').length > 0 && (
                      <optgroup label="Borradores / pausadas / cerradas">
                        {formations.filter((formation) => formation.status !== 'active').map((formation) => <option key={formation.id} value={formation.id}>{formation.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>

                {selectedFormation ? (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <select
                        value={selectedFormation.status}
                        onChange={(event) => updateFormationStatus(selectedFormation.id, event.target.value as any)}
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600"
                      >
                        <option value="draft">Borrador</option>
                        <option value="active">Activa</option>
                        <option value="paused">Pausada</option>
                        <option value="closed">Cerrada</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          deleteFormation(selectedFormation.id);
                          setSelectedFormationId('');
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-2 py-1 text-xs font-black text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={13} />
                        Eliminar
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <input value={selectedFormation.name} onChange={(event) => updateFormation(selectedFormation.id, { name: event.target.value })} placeholder="Título" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900" />
                      <textarea value={selectedFormation.objective} onChange={(event) => updateFormation(selectedFormation.id, { objective: event.target.value })} placeholder="De qué trata" rows={2} className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" />
                      <div className="grid gap-2 md:grid-cols-2">
                        <input value={selectedFormation.duration || ''} onChange={(event) => updateFormation(selectedFormation.id, { duration: event.target.value })} placeholder="Duración" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" />
                        <input value={selectedFormation.teacher || ''} onChange={(event) => updateFormation(selectedFormation.id, { teacher: event.target.value })} placeholder="Docente" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" />
                        <input value={selectedFormation.audienceSize || ''} onChange={(event) => updateFormation(selectedFormation.id, { audienceSize: event.target.value })} placeholder="Personas estimadas" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" />
                        <input value={selectedFormation.tools || ''} onChange={(event) => updateFormation(selectedFormation.id, { tools: event.target.value })} placeholder="Herramientas" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" />
                      </div>
                      <textarea value={selectedFormation.purpose} onChange={(event) => updateFormation(selectedFormation.id, { purpose: event.target.value })} placeholder="Para qué sirve" rows={2} className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" />
                      <textarea value={selectedFormation.structure} onChange={(event) => updateFormation(selectedFormation.id, { structure: event.target.value })} placeholder="Estructura / pasos" rows={4} className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" />
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay formaciones todavía.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <ListEmpty show={activeFormations.length === 0} text="No hay formaciones activas todavía." />
              {activeFormations.slice(0, 6).map((formation) => (
            <div key={formation.id} className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{formation.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{formation.objective || formation.purpose || 'Sin objetivo todavía.'}</p>
                  {(formation.duration || formation.teacher || formation.audienceSize || formation.tools) && (
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      {[formation.duration, formation.teacher, formation.audienceSize, formation.tools].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {canManageFormations ? (
                  <select
                    value={formation.status}
                    onChange={(event) => updateFormationStatus(formation.id, event.target.value as any)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-600"
                  >
                    <option value="draft">Borrador</option>
                    <option value="active">Activa</option>
                    <option value="paused">Pausada</option>
                    <option value="closed">Cerrada</option>
                  </select>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">Activa</span>
                )}
              </div>
              {formation.structure && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">{formation.structure}</p>}
            </div>
              ))}
            </>
          )}
        </Panel>

        {(isSalesSupportView || isFaqNotebookView) && <Panel title="Soporte de alumnos" icon={HelpCircle}>
          <form onSubmit={handleCreateSupport} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <select value={supportDraft.formationId} onChange={(e) => setSupportDraft((p) => ({ ...p, formationId: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
              <option value="">Sin formación concreta</option>
              {activeFormations.map((formation) => <option key={formation.id} value={formation.id}>{formation.name}</option>)}
            </select>
            <input value={supportDraft.student} onChange={(e) => setSupportDraft((p) => ({ ...p, student: e.target.value }))} placeholder="Alumno/contacto" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
            <textarea value={supportDraft.query} onChange={(e) => setSupportDraft((p) => ({ ...p, query: e.target.value }))} placeholder="Consulta o incidencia" rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <select value={supportDraft.type} onChange={(e) => setSupportDraft((p) => ({ ...p, type: e.target.value as StudentSupportRecord['type'] }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                <option value="access">Acceso</option>
                <option value="content">Contenido</option>
                <option value="functionality">Funcionamiento</option>
                <option value="other">Otro</option>
              </select>
              <input value={supportDraft.tags} onChange={(e) => setSupportDraft((p) => ({ ...p, tags: e.target.value }))} placeholder="#tags" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
            </div>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white">
              <Plus size={14} />
              Registrar soporte
            </button>
          </form>
          <TagCloud tags={supportTags} />
          <ListEmpty show={support.length === 0} text="No hay soporte registrado." />
          {support.slice(0, 7).map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{item.student || 'Consulta'}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{item.query}</p>
                  <p className="mt-2 text-xs font-bold text-slate-500">{supportTypeLabel(item.type)} · {item.tags.join(', ') || 'sin tags'}</p>
                </div>
                {item.status === 'pending' ? (
                  <button type="button" onClick={() => updateSupportStatus(item.id, 'resolved')} className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                    <CheckCircle2 size={17} />
                  </button>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">Resuelto</span>
                )}
              </div>
            </div>
          ))}
        </Panel>}

        {(isSalesSupportView || isCommercialNotebookView) && (
          <div className={isCommercialNotebookView ? 'xl:col-span-2' : ''}>
            <Panel title="Radar comercial" icon={Radar}>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                  <p className="text-2xl font-black text-slate-950">{commercialStages[0].items.length}</p>
                  <p className="text-xs font-black uppercase tracking-wide text-orange-700">Necesidades</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-2xl font-black text-slate-950">{commercialStages[1].items.length}</p>
                  <p className="text-xs font-black uppercase tracking-wide text-amber-700">Oportunidades</p>
                </div>
                <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                  <p className="text-2xl font-black text-slate-950">{commercialStages[2].items.length}</p>
                  <p className="text-xs font-black uppercase tracking-wide text-teal-700">Propuestas/proyectos</p>
                </div>
              </div>

              {(needTags.length > 0 || topProductSignals.length > 0) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Patrones por tag</p>
                    <TagCloud tags={needTags} />
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Productos más repetidos</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {topProductSignals.map(([product, count]) => (
                        <span key={product} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">
                          {product} · {count}
                        </span>
                      ))}
                      {topProductSignals.length === 0 && <span className="text-sm font-semibold text-slate-500">Sin productos detectados todavía.</span>}
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateNeed} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-2 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
                  <input value={needDraft.detected} onChange={(e) => setNeedDraft((p) => ({ ...p, detected: e.target.value }))} placeholder="Qué se detectó" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                  <select value={needDraft.product} onChange={(e) => setNeedDraft((p) => ({ ...p, product: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                    <option value="">Producto</option>
                    {PRODUCT_OPTIONS.map((product) => <option key={product.code} value={`${product.code} · ${product.label}`}>{product.code} · {product.label}</option>)}
                  </select>
                  <input value={needDraft.frequency} onChange={(e) => setNeedDraft((p) => ({ ...p, frequency: e.target.value }))} placeholder="Frecuencia" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                </div>
                <textarea value={needDraft.context} onChange={(e) => setNeedDraft((p) => ({ ...p, context: e.target.value }))} placeholder="Contexto / cliente / de dónde viene la señal" rows={2} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
                <textarea value={needDraft.solution} onChange={(e) => setNeedDraft((p) => ({ ...p, solution: e.target.value }))} placeholder="Propuesta de solución" rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input value={needDraft.tags} onChange={(e) => setNeedDraft((p) => ({ ...p, tags: e.target.value }))} placeholder="Tags separados por coma" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
                  <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white">
                    <Lightbulb size={14} />
                    Registrar necesidad
                  </button>
                </div>
                <p className="rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-500">
                  Guía de lectura: registra señales pequeñas, sube a oportunidad cuando se repite o tiene solución posible, y crea proyecto solo cuando ya haya algo accionable.
                </p>
              </form>

              {commonCommercialFoci.length > 0 && (
                <section className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Focos comunes detectados</p>
                      <h3 className="mt-1 text-lg font-black text-slate-950">Tags que se repiten y pueden pedir una respuesta común</h3>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-teal-700">{commonCommercialFoci.length} foco(s)</span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {commonCommercialFoci.map((focus) => (
                      <details key={focus.display} className="rounded-2xl border border-teal-100 bg-white p-3">
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black text-slate-950">{focus.display}</p>
                            <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-black text-teal-700">{focus.items.length} señales</span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-500">Podría convertirse en FAQ, ajuste web, contenido, formación o proyecto.</p>
                        </summary>
                        <div className="mt-3 space-y-2">
                          {focus.items.slice(0, 4).map((need) => (
                            <div key={`${focus.display}-${need.id}`} className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-sm font-black text-slate-800">{need.detected}</p>
                              <p className="text-xs font-semibold text-slate-500">{need.product || 'sin producto'} · {needStatusLabel(need.status)}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              <ListEmpty show={needs.length === 0} text="No hay señales comerciales registradas todavía." />
              <div className="space-y-3">
                {commercialStages.map((stage) => (
                  <details key={stage.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-3" open={stage.items.length > 0 && stage.key === 'need'}>
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-slate-950">{stage.title}</h3>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{stage.hint}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">{stage.items.length}</span>
                      </div>
                    </summary>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                      {stage.items.map((need) => (
                        <div key={need.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-slate-950">{need.detected}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-600">{need.solution || need.context || 'Sin propuesta todavía.'}</p>
                              <p className="mt-2 text-xs font-bold text-slate-500">
                                {need.product || 'sin producto'} · {need.frequency || 'sin frecuencia'}
                              </p>
                            </div>
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${needStatusClass(need.status)}`}>
                              {needStatusLabel(need.status)}
                            </span>
                          </div>
                          {need.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {need.tags.map((tag) => <span key={`${need.id}-${tag}`} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{tag}</span>)}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {need.status === 'need' && (
                              <button type="button" onClick={() => updateNeed(need.id, { status: 'opportunity' })} className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
                                <ArrowRight size={13} />
                                Pasar a oportunidad
                              </button>
                            )}
                            {need.status === 'opportunity' && (
                              <button type="button" onClick={() => updateNeed(need.id, { status: 'need' })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">
                                Volver a necesidad
                              </button>
                            )}
                            {need.status !== 'project_proposed' && (
                              <button type="button" onClick={() => promoteNeedToProject(need.id)} className="inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-xs font-black text-white">
                                <FolderKanban size={13} />
                                Crear proyecto
                              </button>
                            )}
                            <button type="button" onClick={() => updateNeed(need.id, { status: 'resolved' })} className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                              <CheckCircle2 size={13} />
                              Solventada
                            </button>
                            <button type="button" onClick={() => updateNeed(need.id, { status: 'archived' })} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">
                              <Archive size={13} />
                              Archivar
                            </button>
                            {need.linkedProjectId && (
                              <span className="rounded-xl bg-teal-50 px-3 py-2 text-xs font-black text-teal-700">Proyecto creado</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {stage.items.length === 0 && (
                        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-xs font-semibold text-slate-500">Sin registros en esta etapa.</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
              {closedCommercialSignals.length > 0 && (
                <details className="rounded-2xl border border-slate-200 bg-white p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-slate-950">Historial solventado / archivado</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Se conserva para aprendizaje, pero no ocupa el radar activo.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{closedCommercialSignals.length}</span>
                    </div>
                  </summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {closedCommercialSignals.map((need) => (
                      <div key={need.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-950">{need.detected}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{need.solution || need.context || 'Sin propuesta registrada.'}</p>
                            <p className="mt-2 text-xs font-bold text-slate-500">{need.product || 'sin producto'} · {need.tags.join(', ') || 'sin tags'}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${needStatusClass(need.status)}`}>
                            {needStatusLabel(need.status)}
                          </span>
                        </div>
                        <button type="button" onClick={() => updateNeed(need.id, { status: 'need' })} className="mt-3 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">
                          <RotateCcw size={13} />
                          Reabrir
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Panel>
          </div>
        )}

        {(isSalesSupportView || isFaqNotebookView) && <Panel title="Preguntas frecuentes" icon={HelpCircle}>
          <form onSubmit={handleCreateFaq} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="grid grid-cols-2 gap-2">
              <select value={faqDraft.group} onChange={(e) => setFaqDraft((p) => ({ ...p, group: e.target.value as FaqRecord['group'] }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                <option value="products">Producto / empresa</option>
                <option value="formations">Formaciones</option>
              </select>
              {faqDraft.group === 'formations' ? (
                <select value={faqDraft.formationId} onChange={(e) => setFaqDraft((p) => ({ ...p, formationId: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                  <option value="">Elegir formación</option>
                  {activeFormations.map((formation) => <option key={formation.id} value={formation.id}>{formation.name}</option>)}
                </select>
              ) : (
                <select value={faqDraft.product} onChange={(e) => setFaqDraft((p) => ({ ...p, product: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                  <option value="">Elegir producto / empresa</option>
                  <option value="empresa">Empresa Solaris</option>
                  {PRODUCT_OPTIONS.map((product) => <option key={product.code} value={`${product.code} · ${product.label}`}>{product.code} · {product.label}</option>)}
                </select>
              )}
            </div>
            <textarea value={faqDraft.question} onChange={(e) => setFaqDraft((p) => ({ ...p, question: e.target.value }))} placeholder="Pregunta" rows={2} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
            <textarea value={faqDraft.answer} onChange={(e) => setFaqDraft((p) => ({ ...p, answer: e.target.value }))} placeholder="Respuesta / propuesta" rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none" />
            <input value={faqDraft.tags} onChange={(e) => setFaqDraft((p) => ({ ...p, tags: e.target.value }))} placeholder="Tags separados por coma" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none" />
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white">
              <Plus size={14} />
              Registrar pregunta
            </button>
          </form>
          <ListEmpty show={faqs.length === 0} text="No hay preguntas frecuentes todavía." />
          {faqs.slice(0, 8).map((faq) => (
            <div key={faq.id} className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{faq.question}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{faq.answer || 'Pendiente de respuesta.'}</p>
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {faqGroupLabel(faq.group)}{faq.group === 'products' && faq.product ? ` · ${faq.product}` : ''} · {faq.tags.join(', ') || 'sin tags'}
                  </p>
                </div>
                <select
                  value={faq.status}
                  onChange={(event) => updateFaqStatus(faq.id, event.target.value as FaqRecord['status'])}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-600"
                >
                  <option value="new">Nueva</option>
                  <option value="reviewed">Revisada</option>
                  <option value="published">Publicada</option>
                </select>
              </div>
            </div>
          ))}
        </Panel>}
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="inline-flex rounded-2xl bg-pink-50 p-3 text-pink-700"><Icon size={20} /></span>
      <p className="mt-4 text-3xl font-black text-slate-950">{value}</p>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-xl bg-slate-100 p-2 text-slate-600"><Icon size={18} /></span>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TagCloud({ tags }: { tags: Array<[string, number]> }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(([tag, count]) => (
        <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
          #{tag} · {count}
        </span>
      ))}
    </div>
  );
}

function ListEmpty({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">{text}</p>;
}
