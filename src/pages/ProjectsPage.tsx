import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleDot, ChevronDown, FolderKanban, Link2, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { FileUploader } from '../components/FileUploader';
import { ESTEBAN_ID, USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import {
  calculateProjectProgress,
  LunarisProject,
  ProjectPriority,
  ProjectStepStatus,
  ProjectType,
  projectStatusLabel,
  projectStepStatusLabel,
  projectTypeLabel,
  useProjects,
} from '../hooks/useProjects';
import { useTodos } from '../hooks/useTodos';
import type { Attachment } from '../types';

const PROJECT_TYPES: ProjectType[] = ['general', 'contenido', 'cupon_promocion', 'sistema_tecnologia', 'formacion', 'inventario_logistica', 'finanzas', 'expansion'];
const STEP_STATUSES: ProjectStepStatus[] = ['pending', 'in_progress', 'waiting', 'blocked', 'validation', 'completed'];
const PREVIEW_ROLE_TO_USER_NAME: Record<string, string> = {
  direction: 'Thalia',
  sales: 'Itzi',
  warehouse: 'Anabella',
  finance: 'Heidy',
  operations: 'Esteban',
  support: 'Fer',
};

function userName(id?: string) {
  return USERS.find((user) => user.id === id)?.name || 'Usuario';
}

function projectPriorityLabel(priority?: ProjectPriority) {
  if (priority === 'urgent') return 'Urgente';
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baja';
  return 'Media';
}

function nextStepFor(project: LunarisProject) {
  return (project.steps || []).find((step) => step.status !== 'completed') || (project.steps || [])[0];
}

function progressTone(status: LunarisProject['status']) {
  if (status === 'pending') return 'bg-slate-400';
  if (status === 'blocked') return 'bg-red-500';
  if (status === 'waiting') return 'bg-amber-500';
  if (status === 'validation') return 'bg-blue-500';
  if (status === 'done') return 'bg-emerald-500';
  return 'bg-teal-600';
}

function progressStroke(status: LunarisProject['status']) {
  if (status === 'pending') return 'stroke-slate-400';
  if (status === 'blocked') return 'stroke-red-500';
  if (status === 'waiting') return 'stroke-amber-500';
  if (status === 'validation') return 'stroke-blue-500';
  if (status === 'done') return 'stroke-emerald-500';
  return 'stroke-teal-600';
}

function ProgressRing({ value, status, size = 58 }: { value: number; status: LunarisProject['status']; size?: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  const offset = circumference - (safeValue / 100) * circumference;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={radius} className="fill-none stroke-slate-100" strokeWidth="6" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          className={`fill-none ${progressStroke(status)}`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-xs font-black text-slate-800">{safeValue}%</span>
    </div>
  );
}

export default function ProjectsPage() {
  const { currentUser } = useAuth();
  const { projects, visibleProjects, createProject, updateProject, deleteProject, addStep, updateStep, linkTaskToStep, requestDecision, ensureEstebanInitialPortfolio } = useProjects(currentUser);
  const { todos, createTodo } = useTodos(currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const [previewRoleKey, setPreviewRoleKey] = useState<string | null>(() => (
    typeof window === 'undefined' ? null : window.localStorage.getItem('lunaris_role_preview')
  ));
  const effectiveProjectUser = useMemo(() => {
    if (!currentUser?.isAdmin || !previewRoleKey) return currentUser || null;
    const previewName = PREVIEW_ROLE_TO_USER_NAME[previewRoleKey];
    return USERS.find((user) => user.name === previewName) || currentUser;
  }, [currentUser, previewRoleKey]);
  const effectiveProjectUserId = effectiveProjectUser?.id || currentUser?.id || '';
  const isPreviewingOtherUser = !!currentUser?.isAdmin && !!previewRoleKey && !!effectiveProjectUserId;
  const isEstebanPreview = effectiveProjectUserId === ESTEBAN_ID && !!currentUser?.isAdmin;
  const displayedProjects = useMemo(() => (
    isPreviewingOtherUser
      ? projects.filter((project) => (
        project.ownerId === effectiveProjectUserId
        || project.responsibleId === effectiveProjectUserId
        || project.participants.includes(effectiveProjectUserId)
        || project.steps.some((step) => step.responsibleId === effectiveProjectUserId)
      ))
      : visibleProjects
  ), [effectiveProjectUserId, isPreviewingOtherUser, projects, visibleProjects]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const selectedProject = selectedProjectId ? displayedProjects.find((project) => project.id === selectedProjectId) || null : null;
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editProjectDraft, setEditProjectDraft] = useState({
    name: '',
    type: 'general' as ProjectType,
    priority: 'medium' as ProjectPriority,
    targetDate: '',
    objective: '',
    description: '',
    expectedResult: '',
    completionDefinition: '',
    tags: '',
  });

  const [projectDraft, setProjectDraft] = useState({
    name: '',
    type: 'general' as ProjectType,
    responsibleId: currentUser?.id || '',
    objective: '',
    description: '',
    priority: 'medium' as ProjectPriority,
    targetDate: '',
    expectedResult: '',
    completionDefinition: '',
    tags: '',
  });

  const [stepDraft, setStepDraft] = useState({
    name: '',
    description: '',
    responsibleId: currentUser?.id || '',
    targetDate: '',
    deliverable: '',
    attachments: [] as Attachment[],
    weight: 10,
    status: 'pending' as ProjectStepStatus,
  });

  const [decisionDraft, setDecisionDraft] = useState({
    targetUserId: '',
    mentionType: 'decidir' as 'validar' | 'decidir',
    situation: '',
    research: '',
    options: '',
    risks: '',
    recommendation: '',
    neededDecision: '',
  });

  const [taskDraftByStep, setTaskDraftByStep] = useState<Record<string, { title: string; assignedTo: string; dueDate: string }>>({});
  const [activeProjectAction, setActiveProjectAction] = useState<'step' | 'decision' | null>(null);
  const suppressedProjectParamRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    const defaultResponsible = effectiveProjectUserId || currentUser.id;
    setProjectDraft((prev) => prev.responsibleId === defaultResponsible ? prev : { ...prev, responsibleId: defaultResponsible });
    setStepDraft((prev) => prev.responsibleId === defaultResponsible ? prev : { ...prev, responsibleId: defaultResponsible });
  }, [currentUser?.id, effectiveProjectUserId]);

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

  useEffect(() => {
    if (effectiveProjectUserId === ESTEBAN_ID) ensureEstebanInitialPortfolio();
  }, [effectiveProjectUserId, ensureEstebanInitialPortfolio]);

  useEffect(() => {
    const projectParam = searchParams.get('project');
    if (projectParam && suppressedProjectParamRef.current === projectParam) return;
    if (projectParam && displayedProjects.some((project) => project.id === projectParam)) {
      setSelectedProjectId(projectParam);
      return;
    }
  }, [displayedProjects, searchParams, selectedProjectId]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'step') setActiveProjectAction('step');
    if (action === 'decision') setActiveProjectAction('decision');
  }, [searchParams]);

  useEffect(() => {
    if (!selectedProject) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('project', selectedProject.id);
    setSearchParams(nextParams, { replace: true });
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject) return;
    setEditProjectDraft({
      name: selectedProject.name,
      type: selectedProject.type,
      priority: selectedProject.priority,
      targetDate: selectedProject.targetDate || '',
      objective: selectedProject.objective || '',
      description: selectedProject.description || '',
      expectedResult: selectedProject.expectedResult || '',
      completionDefinition: selectedProject.completionDefinition || '',
      tags: (selectedProject.tags || []).join(', '),
    });
    setEditProjectOpen(false);
  }, [selectedProject?.id]);

  const selectedProgress = useMemo(() => (
    selectedProject ? calculateProjectProgress(selectedProject) : { completed: 0, planned: 0, unplanned: 100 }
  ), [selectedProject]);

  const handleCreateProject = (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectDraft.name.trim() || !currentUser?.id) return;
    const created = createProject({
      ...projectDraft,
      responsibleId: projectDraft.responsibleId || effectiveProjectUserId || currentUser.id,
      name: projectDraft.name.trim(),
      tags: projectDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      targetDate: projectDraft.targetDate || undefined,
    }, isPreviewingOtherUser ? { ownerId: effectiveProjectUserId, actorId: currentUser.id } : undefined);
    setSelectedProjectId(created.id);
    setTimeout(() => document.getElementById('project-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    setProjectDraft((prev) => ({
      ...prev,
      name: '',
      objective: '',
      description: '',
      expectedResult: '',
      completionDefinition: '',
      tags: '',
    }));
  };

  const handleSaveProjectEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !editProjectDraft.name.trim()) return;
    updateProject(selectedProject.id, {
      name: editProjectDraft.name.trim(),
      type: editProjectDraft.type,
      priority: editProjectDraft.priority,
      targetDate: editProjectDraft.targetDate || undefined,
      objective: editProjectDraft.objective,
      description: editProjectDraft.description,
      expectedResult: editProjectDraft.expectedResult,
      completionDefinition: editProjectDraft.completionDefinition,
      tags: editProjectDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    }, 'Información principal del proyecto editada');
    setEditProjectOpen(false);
  };

  const handleDeleteProject = () => {
    if (!selectedProject) return;
    if (!window.confirm(`¿Eliminar el proyecto "${selectedProject.name}"?`)) return;
    const currentIndex = displayedProjects.findIndex((project) => project.id === selectedProject.id);
    deleteProject(selectedProject.id);
    const nextProject = displayedProjects[currentIndex + 1] || displayedProjects[currentIndex - 1] || null;
    setSelectedProjectId(nextProject?.id || '');
  };

  const selectProject = (projectId: string) => {
    suppressedProjectParamRef.current = null;
    setSelectedProjectId(projectId);
  };

  const closeSelectedProject = () => {
    suppressedProjectParamRef.current = selectedProjectId;
    setEditProjectOpen(false);
    setActiveProjectAction(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('project');
    nextParams.delete('action');
    setSearchParams(nextParams, { replace: true });
    setSelectedProjectId('');
  };

  const handleAddStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !stepDraft.name.trim()) return;
    addStep(selectedProject.id, {
      ...stepDraft,
      targetDate: stepDraft.targetDate || undefined,
      weight: Number(stepDraft.weight || 0),
    });
    setStepDraft((prev) => ({
      ...prev,
      name: '',
      description: '',
      deliverable: '',
      attachments: [],
      targetDate: '',
      weight: 10,
      status: 'pending',
    }));
    setActiveProjectAction(null);
  };

  const createLinkedTask = async (project: LunarisProject, stepId: string) => {
    const draft = taskDraftByStep[stepId] || { title: '', assignedTo: currentUser?.id || '', dueDate: '' };
    if (!draft.title.trim()) return;
    const created = await createTodo({
      title: draft.title.trim(),
      description: `Proyecto: ${project.name}`,
      assignedTo: [draft.assignedTo || currentUser?.id || project.responsibleId],
      dueDateKey: draft.dueDate || null,
      attachments: [],
      tags: ['proyecto', project.name],
    });
    linkTaskToStep(project.id, stepId, created.id);
    setTaskDraftByStep((prev) => ({ ...prev, [stepId]: { title: '', assignedTo: draft.assignedTo, dueDate: '' } }));
  };

  const handleRequestDecision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !decisionDraft.targetUserId || !decisionDraft.neededDecision.trim()) return;
    await requestDecision(selectedProject, decisionDraft);
    setDecisionDraft((prev) => ({
      ...prev,
      situation: '',
      research: '',
      options: '',
      risks: '',
      recommendation: '',
      neededDecision: '',
    }));
    setActiveProjectAction(null);
  };

  const visibleProjectIds = new Set(displayedProjects.map((project) => project.id));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-700">Objetivos y resultados</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">Proyectos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Proyecto es el resultado, paso es la etapa, tarea es la acción concreta. Las tareas siguen viviendo en el módulo de Tareas.
            </p>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-black text-teal-800">
            {displayedProjects.length} visible(s) {isPreviewingOtherUser ? `en cartera de ${effectiveProjectUser?.name}` : 'para ti'}
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setCreateProjectOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="inline-flex items-center gap-2">
                <span className="rounded-xl bg-teal-50 p-2 text-teal-700"><Plus size={18} /></span>
                <span>
                  <span className="block text-lg font-black text-slate-950">Crear proyecto</span>
                  <span className="block text-xs font-bold text-slate-500">Se despliega solo cuando lo necesitas.</span>
                </span>
              </span>
              <ChevronDown size={18} className={`text-slate-400 transition ${createProjectOpen ? 'rotate-180' : ''}`} />
            </button>
            {createProjectOpen && (
          <form onSubmit={handleCreateProject} className="mt-4">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Nombre del proyecto</span>
                <input value={projectDraft.name} onChange={(e) => setProjectDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Ej. Biblioteca Solar Vital" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Tipo de proyecto</span>
                <select value={projectDraft.type} onChange={(e) => setProjectDraft((p) => ({ ...p, type: e.target.value as ProjectType }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none">
                  {PROJECT_TYPES.map((type) => <option key={type} value={type}>{projectTypeLabel(type)}</option>)}
                </select>
              </label>
              <textarea value={projectDraft.objective} onChange={(e) => setProjectDraft((p) => ({ ...p, objective: e.target.value }))} placeholder="Objetivo: qué queremos conseguir" rows={2} className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none" />
              <textarea value={projectDraft.description} onChange={(e) => setProjectDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Descripción / propuesta inicial" rows={3} className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none" />
              <textarea value={projectDraft.completionDefinition} onChange={(e) => setProjectDraft((p) => ({ ...p, completionDefinition: e.target.value }))} placeholder="Definición de terminado: qué tiene que existir para considerar este proyecto al 100%" rows={3} className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Prioridad</span>
                  <select value={projectDraft.priority} onChange={(e) => setProjectDraft((p) => ({ ...p, priority: e.target.value as ProjectPriority }))} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none">
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Fecha objetivo</span>
                  <input type="date" value={projectDraft.targetDate} onChange={(e) => setProjectDraft((p) => ({ ...p, targetDate: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none" />
                </label>
              </div>
              <input value={projectDraft.expectedResult} onChange={(e) => setProjectDraft((p) => ({ ...p, expectedResult: e.target.value }))} placeholder="Resultado esperado / entregable final" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none" />
              <input value={projectDraft.tags} onChange={(e) => setProjectDraft((p) => ({ ...p, tags: e.target.value }))} placeholder="Tags separados por coma" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none" />
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
                Tags = palabras para buscar y agrupar, no controlan permisos ni estados. Ejemplos: #Zoho, #SolarVital, #promoción, #profesionales.
              </p>
              <button type="submit" className="w-full rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black text-white hover:bg-teal-800">
                Crear proyecto
              </button>
            </div>
          </form>
            )}
          </section>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-500">Mis proyectos visibles</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Lista compacta. Abre el proyecto en panel y despliega solo si quieres ver resumen.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{displayedProjects.length}</span>
            </div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
              {displayedProjects.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">Todavía no hay proyectos visibles.</p>}
              {displayedProjects.map((project) => {
                const progress = calculateProjectProgress(project);
                const nextStep = nextStepFor(project);
                return (
                  <div key={project.id} className="bg-white p-3 hover:bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => selectProject(project.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate font-black text-slate-950">{project.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {projectTypeLabel(project.type)} · {projectStatusLabel(project.status)} · {progress.completed}%
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        {project.weeklyPriorityRank ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">
                            P{project.weeklyPriorityRank}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => selectProject(project.id)}
                          className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-black text-white hover:bg-teal-800"
                        >
                          Abrir
                        </button>
                      </div>
                    </div>

                    <details className="mt-2 rounded-xl border border-slate-100 bg-slate-50">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-black text-slate-600">
                        Ver resumen
                        <ChevronDown size={14} />
                      </summary>
                      <div className="border-t border-slate-100 p-3">
                        <div className="grid gap-2 sm:grid-cols-3">
                          <InfoBox label="Prioridad" value={projectPriorityLabel(project.priority)} compact />
                          <InfoBox label="Fecha" value={project.targetDate || 'Sin definir'} compact />
                          <InfoBox label="Siguiente paso" value={nextStep?.name || 'Por definir'} compact />
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                          <div className={`h-full ${progressTone(project.status)}`} style={{ width: `${progress.completed}%` }} />
                        </div>
                        <p className="mt-2 text-[11px] font-black text-slate-500">
                          {progress.completed}% completado · {progress.planned}% planificado · {progress.unplanned}% por planificar
                        </p>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {selectedProject ? (
          <main id="project-detail" className="fixed inset-0 z-[240] overflow-y-auto bg-slate-950/55 p-3 md:pl-64">
            <div className="mx-auto max-w-6xl space-y-5 rounded-[2rem] bg-slate-50 p-4 shadow-2xl md:p-6">
              <div className="flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-700">Proyecto abierto</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedProject.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Este panel se puede cerrar sin salir de la lista.</p>
                </div>
                <button
                  type="button"
                  onClick={closeSelectedProject}
                  className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Cerrar proyecto"
                >
                  <X size={20} />
                </button>
              </div>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              {(() => {
                const nextStep = nextStepFor(selectedProject);
                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">{projectTypeLabel(selectedProject.type)}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{projectStatusLabel(selectedProject.status)}</span>
                    {selectedProject.weeklyPriorityRank ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                        Prioridad activa #{selectedProject.weeklyPriorityRank} esta semana
                      </span>
                    ) : null}
                  </div>
                  <h2 className="text-3xl font-black text-slate-950">{selectedProject.name}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{selectedProject.description || selectedProject.objective}</p>
                  <p className="mt-3 text-xs font-bold text-slate-500">Responsable: {userName(selectedProject.responsibleId)} · Propietario: {userName(selectedProject.ownerId)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <ProgressRing value={selectedProgress.completed} status={selectedProject.status} size={70} />
                  <select
                    value={selectedProject.status}
                    onChange={(e) => updateProject(selectedProject.id, { status: e.target.value as LunarisProject['status'] }, `Estado cambiado a ${projectStatusLabel(e.target.value as LunarisProject['status'])}`)}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 outline-none"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="in_progress">En curso</option>
                    <option value="waiting">Esperando</option>
                    <option value="blocked">Bloqueado</option>
                    <option value="validation">En validación</option>
                    <option value="paused">Pausado</option>
                    <option value="done">Terminado</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditProjectOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${editProjectOpen ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                >
                  <Pencil size={14} />
                  Editar proyecto
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProjectAction((prev) => prev === 'step' ? null : 'step')}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${activeProjectAction === 'step' ? 'bg-teal-700 text-white' : 'border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'}`}
                >
                  <Plus size={14} />
                  Añadir paso
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProjectAction((prev) => prev === 'decision' ? null : 'decision')}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${activeProjectAction === 'decision' ? 'bg-amber-500 text-white' : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                >
                  <Send size={14} />
                  Solicitar decisión
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"
                  title="La observación del proyecto irá en una siguiente mejora del cuaderno/historial."
                >
                  Añadir observación
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <InfoBox label="Completado" value={`${selectedProgress.completed}%`} />
                <InfoBox label="Planificado" value={`${selectedProgress.planned}%`} />
                <InfoBox label="Por planificar" value={`${selectedProgress.unplanned}%`} />
                <InfoBox label="Prioridad" value={projectPriorityLabel(selectedProject.priority)} />
                <InfoBox label="Fecha objetivo" value={selectedProject.targetDate || 'Sin definir'} />
                <InfoBox label="Siguiente paso" value={nextStep?.name || 'Por definir'} />
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${progressTone(selectedProject.status)}`} style={{ width: `${selectedProgress.completed}%` }} />
              </div>
                  </>
                );
              })()}
            </section>

            {editProjectOpen && (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">Editar proyecto</h3>
                    <p className="text-sm font-semibold text-slate-500">Aquí puedes corregir fecha objetivo, prioridad y definición de terminado.</p>
                  </div>
                  <button type="button" onClick={() => setEditProjectOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                    <X size={16} />
                  </button>
                </div>
                <form onSubmit={handleSaveProjectEdit} className="grid gap-3 md:grid-cols-2">
                  <input value={editProjectDraft.name} onChange={(e) => setEditProjectDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  <select value={editProjectDraft.type} onChange={(e) => setEditProjectDraft((p) => ({ ...p, type: e.target.value as ProjectType }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    {PROJECT_TYPES.map((type) => <option key={type} value={type}>{projectTypeLabel(type)}</option>)}
                  </select>
                  <select value={editProjectDraft.priority} onChange={(e) => setEditProjectDraft((p) => ({ ...p, priority: e.target.value as ProjectPriority }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                  <input type="date" value={editProjectDraft.targetDate} onChange={(e) => setEditProjectDraft((p) => ({ ...p, targetDate: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  <textarea value={editProjectDraft.objective} onChange={(e) => setEditProjectDraft((p) => ({ ...p, objective: e.target.value }))} placeholder="Objetivo" rows={2} className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold md:col-span-2" />
                  <textarea value={editProjectDraft.description} onChange={(e) => setEditProjectDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Descripción" rows={3} className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold md:col-span-2" />
                  <textarea value={editProjectDraft.expectedResult} onChange={(e) => setEditProjectDraft((p) => ({ ...p, expectedResult: e.target.value }))} placeholder="Resultado esperado" rows={2} className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold md:col-span-2" />
                  <textarea value={editProjectDraft.completionDefinition} onChange={(e) => setEditProjectDraft((p) => ({ ...p, completionDefinition: e.target.value }))} placeholder="Definición de terminado: cómo sabemos que llegó al 100%" rows={3} className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold md:col-span-2" />
                  <input value={editProjectDraft.tags} onChange={(e) => setEditProjectDraft((p) => ({ ...p, tags: e.target.value }))} placeholder="Tags separados por coma" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold md:col-span-2" />
                  <button type="submit" className="rounded-xl bg-teal-700 px-3 py-2 text-sm font-black text-white md:col-span-2">Guardar cambios</button>
                </form>
              </section>
            )}

            {activeProjectAction === 'step' && (
              <section className="rounded-3xl border border-teal-200 bg-teal-50/60 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <span className="rounded-xl bg-white p-2 text-teal-700"><Plus size={18} /></span>
                  <div>
                    <h3 className="text-lg font-black text-slate-950">Añadir paso al proyecto</h3>
                    <p className="text-sm font-semibold text-teal-800">Un paso es una etapa del proyecto. No es obligatorio convertirlo en tarea.</p>
                  </div>
                </div>
                <form onSubmit={handleAddStep} className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Nombre del paso</span>
                    <input value={stepDraft.name} onChange={(e) => setStepDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Ej. Auditar accesos Zoho" className="w-full rounded-xl border border-teal-100 px-3 py-2 text-sm font-bold outline-none" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Responsable del paso</span>
                    <select value={stepDraft.responsibleId} onChange={(e) => setStepDraft((p) => ({ ...p, responsibleId: e.target.value }))} className="w-full rounded-xl border border-teal-100 px-3 py-2 text-sm font-bold outline-none">
                      {USERS.filter((user) => !user.isRestricted).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Entregable esperado del paso</span>
                    <input value={stepDraft.deliverable} onChange={(e) => setStepDraft((p) => ({ ...p, deliverable: e.target.value }))} placeholder="Qué queda hecho al completar este paso" className="w-full rounded-xl border border-teal-100 px-3 py-2 text-sm font-bold outline-none" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Peso %</span>
                      <input type="number" min="0" max="100" value={stepDraft.weight} onChange={(e) => setStepDraft((p) => ({ ...p, weight: Number(e.target.value) }))} className="w-full rounded-xl border border-teal-100 px-3 py-2 text-sm font-bold outline-none" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Fecha objetivo</span>
                      <input type="date" value={stepDraft.targetDate} onChange={(e) => setStepDraft((p) => ({ ...p, targetDate: e.target.value }))} className="w-full rounded-xl border border-teal-100 px-3 py-2 text-sm font-bold outline-none" />
                    </label>
                  </div>
                  <textarea value={stepDraft.description} onChange={(e) => setStepDraft((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="Descripción del paso" className="md:col-span-2 w-full resize-none rounded-xl border border-teal-100 px-3 py-2 text-sm font-semibold outline-none" />
                  <div className="md:col-span-2 rounded-2xl border border-teal-100 bg-white p-3">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Archivos del entregable</p>
                    <p className="mb-3 text-xs font-semibold text-slate-500">
                      Puedes adjuntar documentos, imágenes, PDF o Excel relacionados con este paso.
                    </p>
                    <FileUploader
                      folderPath={`projects/${selectedProject.id}/step-deliverables`}
                      existingFiles={stepDraft.attachments}
                      onUploadComplete={(files) => setStepDraft((prev) => ({ ...prev, attachments: files }))}
                      acceptedTypes="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                      compact
                      maxSizeMB={20}
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setActiveProjectAction(null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Cerrar</button>
                    <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-xs font-black text-white">
                      <Plus size={14} />
                      Guardar paso
                    </button>
                  </div>
                </form>
              </section>
            )}

            {activeProjectAction === 'decision' && (
              <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <span className="rounded-xl bg-white p-2 text-amber-700"><Send size={18} /></span>
                  <div>
                    <h3 className="text-lg font-black text-slate-950">Solicitar decisión o validación</h3>
                    <p className="text-sm font-semibold text-amber-800">Esto crea una mención de tipo decidir/validar para la persona elegida.</p>
                  </div>
                </div>
                <form onSubmit={handleRequestDecision} className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Persona que debe responder</span>
                    <select value={decisionDraft.targetUserId} onChange={(e) => setDecisionDraft((p) => ({ ...p, targetUserId: e.target.value }))} className="w-full rounded-xl border border-amber-100 px-3 py-2 text-sm font-bold outline-none">
                      <option value="">Elegir persona...</option>
                      {USERS.filter((user) => !user.isRestricted).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Tipo</span>
                    <select value={decisionDraft.mentionType} onChange={(e) => setDecisionDraft((p) => ({ ...p, mentionType: e.target.value as 'validar' | 'decidir' }))} className="w-full rounded-xl border border-amber-100 px-3 py-2 text-sm font-bold outline-none">
                      <option value="decidir">Decidir</option>
                      <option value="validar">Validar</option>
                    </select>
                  </label>
                  {(['situation', 'research', 'options', 'risks', 'recommendation', 'neededDecision'] as const).map((field) => (
                    <textarea
                      key={field}
                      value={decisionDraft[field]}
                      onChange={(e) => setDecisionDraft((p) => ({ ...p, [field]: e.target.value }))}
                      rows={field === 'neededDecision' ? 3 : 2}
                      placeholder={{
                        situation: 'Situación',
                        research: 'Qué se investigó',
                        options: 'Opciones',
                        risks: 'Ventajas / riesgos',
                        recommendation: 'Recomendación',
                        neededDecision: 'Decisión concreta necesaria',
                      }[field]}
                      className="w-full resize-none rounded-xl border border-amber-100 px-3 py-2 text-sm font-semibold outline-none"
                    />
                  ))}
                  <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setActiveProjectAction(null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Cerrar</button>
                    <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">
                      <Send size={14} />
                      Crear mención
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-slate-950">Pasos del proyecto</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{selectedProject.steps.length}</span>
                </div>

                <div className="space-y-3">
                  {selectedProject.steps.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">Aún no hay pasos. No pasa nada: no hay que inventar el 100% desde el primer día.</p>}
                  {selectedProject.steps.map((step) => {
                    const draft = taskDraftByStep[step.id] || { title: '', assignedTo: step.responsibleId, dueDate: step.targetDate || '' };
                    const linkedTasks = todos.filter((todo) => step.taskIds.includes(todo.id) && visibleProjectIds.has(selectedProject.id));
                    return (
                      <article key={step.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-black text-slate-950">{step.name}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{step.description || step.deliverable}</p>
                            <p className="mt-2 text-xs font-bold text-slate-500">{userName(step.responsibleId)} · {step.weight}% · {step.targetDate || 'sin fecha'}</p>
                          </div>
                          <select value={step.status} onChange={(e) => updateStep(selectedProject.id, step.id, { status: e.target.value as ProjectStepStatus })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                            {STEP_STATUSES.map((status) => <option key={status} value={status}>{projectStepStatusLabel(status)}</option>)}
                          </select>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {linkedTasks.map((task) => (
                            <span key={task.id} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                              <Link2 size={12} />
                              Tarea #{task.id}: {task.title}
                            </span>
                          ))}
                          {(step.attachments || []).map((file) => (
                            <a
                              key={`${file.url}-${file.name}`}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-teal-700 hover:bg-teal-50"
                            >
                              <Link2 size={12} />
                              {file.name}
                            </a>
                          ))}
                        </div>

                        <details className="mt-3 rounded-xl border border-slate-200 bg-white">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-black text-slate-700">
                            Crear tarea vinculada a este paso
                            <ChevronDown size={14} />
                          </summary>
                          <div className="grid gap-2 border-t border-slate-100 p-3 md:grid-cols-[minmax(0,1fr)_150px_130px_auto]">
                            <input value={draft.title} onChange={(e) => setTaskDraftByStep((prev) => ({ ...prev, [step.id]: { ...draft, title: e.target.value } }))} placeholder="Título de la tarea" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none" />
                            <select value={draft.assignedTo} onChange={(e) => setTaskDraftByStep((prev) => ({ ...prev, [step.id]: { ...draft, assignedTo: e.target.value } }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none">
                              {USERS.filter((user) => !user.isRestricted).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                            </select>
                            <input type="date" value={draft.dueDate} onChange={(e) => setTaskDraftByStep((prev) => ({ ...prev, [step.id]: { ...draft, dueDate: e.target.value } }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none" />
                            <button type="button" onClick={() => createLinkedTask(selectedProject, step.id)} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white">
                              Crear tarea
                            </button>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-5">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-lg font-black text-slate-950">Historial</h3>
                  <div className="space-y-2">
                    {selectedProject.history.slice().reverse().slice(0, 8).map((entry) => (
                      <div key={entry.id} className="flex gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                        <CircleDot size={15} className="mt-0.5 shrink-0 text-teal-700" />
                        <div>
                          <p>{entry.text}</p>
                          <p className="mt-1 text-[11px] font-black text-slate-400">{userName(entry.userId)} · {new Date(entry.createdAt).toLocaleString('es-ES')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>
            </div>
          </main>
        ) : (
          <main className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <FolderKanban className="mx-auto text-slate-300" size={40} />
            <p className="mt-4 text-sm font-bold text-slate-500">Crea tu primer proyecto para empezar.</p>
          </main>
        )}
      </section>
    </div>
  );
}

function InfoBox({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-slate-50 ${compact ? 'p-3' : 'p-4'}`}>
      <p className={`${compact ? 'truncate text-sm' : 'text-2xl'} font-black text-slate-950`}>{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
