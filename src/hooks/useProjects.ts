import { useCallback, useMemo } from 'react';
import { ESTEBAN_ID } from '../constants';
import type { Attachment, User } from '../types';
import { MentionType, useMentions } from './useMentions';
import { useSharedJsonState } from './useSharedJsonState';

export const PROJECTS_KEY = 'projects_v1';

export type ProjectType =
  | 'general'
  | 'contenido'
  | 'cupon_promocion'
  | 'sistema_tecnologia'
  | 'formacion'
  | 'inventario_logistica'
  | 'finanzas'
  | 'expansion';

export type ProjectStatus = 'pending' | 'in_progress' | 'waiting' | 'blocked' | 'validation' | 'paused' | 'done';
export type ProjectStepStatus = 'pending' | 'in_progress' | 'waiting' | 'blocked' | 'validation' | 'completed';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ProjectTaskLink = {
  taskId: number;
  stepId?: string;
  createdAt: string;
};

export type ProjectStep = {
  id: string;
  name: string;
  description: string;
  responsibleId: string;
  targetDate?: string;
  deliverable: string;
  attachments?: Attachment[];
  weight: number;
  status: ProjectStepStatus;
  taskIds: number[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectHistoryEntry = {
  id: string;
  type: 'created' | 'updated' | 'step_added' | 'step_updated' | 'decision_requested' | 'task_linked' | 'closed';
  userId: string;
  text: string;
  createdAt: string;
};

export type ProjectDecisionDraft = {
  targetUserId: string;
  mentionType: Extract<MentionType, 'validar' | 'decidir'>;
  situation: string;
  research: string;
  options: string;
  risks: string;
  recommendation: string;
  neededDecision: string;
};

export type LunarisProject = {
  id: string;
  name: string;
  type: ProjectType;
  ownerId: string;
  responsibleId: string;
  objective: string;
  description: string;
  priority: ProjectPriority;
  targetDate?: string;
  expectedResult: string;
  completionDefinition: string;
  status: ProjectStatus;
  weeklyPriorityRank?: number;
  waitingFor?: string;
  waitingSince?: string;
  waitingReason?: string;
  participants: string[];
  tags: string[];
  steps: ProjectStep[];
  taskLinks: ProjectTaskLink[];
  history: ProjectHistoryEntry[];
  closure?: {
    result: string;
    fulfilledObjective: string;
    learnings: string;
    pendingFollowUp: string;
    finalDocs: string;
    closedAt: string;
    closedBy: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type ProjectDraft = Pick<
  LunarisProject,
  'name' | 'type' | 'responsibleId' | 'objective' | 'description' | 'priority' | 'targetDate' | 'expectedResult' | 'completionDefinition' | 'tags'
>;

export type ProjectStepDraft = Pick<ProjectStep, 'name' | 'description' | 'responsibleId' | 'targetDate' | 'deliverable' | 'attachments' | 'weight' | 'status'>;

const ESTEBAN_INITIAL_PORTFOLIO: Array<ProjectDraft & { status: ProjectStatus; weeklyPriorityRank?: number }> = [
  {
    name: 'P1 · Infraestructura Digital Solaris',
    type: 'sistema_tecnologia',
    responsibleId: ESTEBAN_ID,
    objective: 'Tener identificado, documentado y bajo control el ecosistema digital de Solaris.',
    description: 'Auditar Zoho Commerce, Zoho Campaigns, Zoho Forms, web, dominio solaris.global, DNS, correo, accesos, responsables, proveedores tecnológicos, incidencias pendientes y documentación importante.',
    priority: 'high',
    targetDate: '',
    expectedResult: 'Mapa de infraestructura digital y accesos.',
    completionDefinition: 'Existe un mapa claro y actualizado de la infraestructura digital de Solaris donde se sabe qué herramientas existen, para qué sirven, quién tiene acceso, dónde se administran, qué problemas hay y cuál es el procedimiento para gestionarlas.',
    tags: ['P1', 'infraestructura', 'zoho', 'sistemas'],
    status: 'in_progress',
    weeklyPriorityRank: 1,
  },
  {
    name: 'P2 · Marco de comunicación y cumplimiento',
    type: 'contenido',
    responsibleId: ESTEBAN_ID,
    objective: 'Definir cómo puede Solaris comunicar productos, composición, concepto propio, Sales de Prana y contenidos respetando el marco legal y regulatorio.',
    description: 'Preparar reunión con Carlitos, revisar límites de comunicación, afirmaciones permitidas/evitables, validaciones necesarias y criterios para contenido, flyers, web, campañas y materiales.',
    priority: 'high',
    targetDate: '',
    expectedResult: 'Resumen del marco legal/comunicativo y primera guía práctica.',
    completionDefinition: 'Existe una guía práctica de comunicación y cumplimiento que pueda utilizar todo el equipo y proveedores externos para saber qué se puede decir, qué no y qué necesita validación.',
    tags: ['P2', 'cumplimiento', 'comunicacion', 'contenido'],
    status: 'in_progress',
    weeklyPriorityRank: 2,
  },
  {
    name: 'P3 · Inteligencia comercial',
    type: 'contenido',
    responsibleId: ESTEBAN_ID,
    objective: 'Convertir la información que recoge Ventas en conocimiento útil para decisiones, contenido, materiales y proyectos.',
    description: 'Trabajar especialmente con Itzi para recopilar preguntas frecuentes, necesidades detectadas, objeciones, intereses, productos consultados, solicitudes de protocolos/material, oportunidades y patrones.',
    priority: 'high',
    targetDate: '',
    expectedResult: 'Primer informe de inteligencia comercial.',
    completionDefinition: 'Existe un sistema continuo donde la información real de clientes se convierte en propuestas concretas para contenido, marketing, promociones, formación o mejora de producto/servicio.',
    tags: ['P3', 'ventas', 'inteligencia-comercial', 'itzi'],
    status: 'in_progress',
    weeklyPriorityRank: 3,
  },
  {
    name: 'P4 · Cupones y promociones',
    type: 'cupon_promocion',
    responsibleId: ESTEBAN_ID,
    objective: 'Auditar, ordenar y mejorar el sistema actual de cupones, promociones y descuentos de Solaris.',
    description: 'Revisar cupones actuales, archivar los que no tengan sentido, documentar funcionamiento, compatibilidad con descuentos profesionales, rentabilidad con Heidi, condiciones y nuevas propuestas.',
    priority: 'medium',
    targetDate: '',
    expectedResult: 'Listado de cupones actuales con estado, funcionamiento y preguntas pendientes.',
    completionDefinition: 'Solaris tiene un sistema claro, documentado y económicamente validado de cupones y promociones.',
    tags: ['P4', 'cupones', 'promociones'],
    status: 'pending',
  },
  {
    name: 'P5 · Biblioteca de producto y contenido',
    type: 'contenido',
    responsibleId: ESTEBAN_ID,
    objective: 'Crear una fuente organizada y fiable de información de cada producto Solaris para ventas, web, formación, marketing y proveedores externos.',
    description: 'Organizar ficha técnica, composición, cantidades, uso documentado, evidencia, fuentes, declaraciones permitidas, preguntas frecuentes, objeciones, webinars, protocolos, imágenes, recursos y necesidades pendientes.',
    priority: 'medium',
    targetDate: '',
    expectedResult: 'Ficha maestra piloto de un producto.',
    completionDefinition: 'Cada producto tiene una ficha maestra interna organizada y reutilizable desde la que pueden generarse materiales comerciales, educativos y web sin reconstruir la información desde cero.',
    tags: ['P5', 'producto', 'contenido', 'biblioteca'],
    status: 'pending',
  },
  {
    name: 'P6 · Formación y certificación',
    type: 'formacion',
    responsibleId: ESTEBAN_ID,
    objective: 'Preparar a Esteban para apoyar operativa y académicamente el sistema de formación y certificación de Solaris.',
    description: 'Estudiar formaciones actuales, paradigma, Sales de Prana, materiales, ejercicios, criterios de corrección, seguimiento de alumnos, revisión inicial de ejercicios y estructura de casos/evaluaciones.',
    priority: 'medium',
    targetDate: '',
    expectedResult: 'Mapa de conocimientos y criterios que debe aprender.',
    completionDefinition: 'Esteban tiene conocimiento y criterios suficientes para realizar una primera revisión formativa y operativa antes de que los casos finales lleguen a la profesora.',
    tags: ['P6', 'formacion', 'certificacion'],
    status: 'pending',
  },
  {
    name: 'P7 · Expansión',
    type: 'expansion',
    responsibleId: ESTEBAN_ID,
    objective: 'Investigar y ejecutar proyectos de expansión previamente aprobados por Dirección.',
    description: 'Trabajar el cómo implementar expansiones aprobadas: Amazon, mercados europeos, requisitos operativos, logística, documentación, costes, barreras y herramientas necesarias.',
    priority: 'medium',
    targetDate: '',
    expectedResult: 'Estado actual del proyecto Amazon + requisitos + bloqueos + próximos pasos.',
    completionDefinition: 'Cada proyecto de expansión aprobado tiene un plan operativo claro de requisitos, costes, pasos, riesgos y próximos movimientos.',
    tags: ['P7', 'expansion', 'amazon'],
    status: 'pending',
  },
];

function uniqueId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function historyEntry(userId: string, type: ProjectHistoryEntry['type'], text: string): ProjectHistoryEntry {
  return {
    id: uniqueId('project-history'),
    type,
    userId,
    text,
    createdAt: new Date().toISOString(),
  };
}

export function projectStatusLabel(status: ProjectStatus) {
  if (status === 'pending') return 'Pendiente';
  if (status === 'in_progress') return 'En curso';
  if (status === 'waiting') return 'Esperando';
  if (status === 'blocked') return 'Bloqueado';
  if (status === 'validation') return 'En validación';
  if (status === 'paused') return 'Pausado';
  return 'Terminado';
}

export function projectStepStatusLabel(status: ProjectStepStatus) {
  if (status === 'in_progress') return 'En curso';
  if (status === 'waiting') return 'Esperando';
  if (status === 'blocked') return 'Bloqueado';
  if (status === 'validation') return 'En validación';
  if (status === 'completed') return 'Completado';
  return 'Pendiente';
}

export function projectTypeLabel(type: ProjectType) {
  if (type === 'contenido') return 'Contenido';
  if (type === 'cupon_promocion') return 'Cupón / Promoción';
  if (type === 'sistema_tecnologia') return 'Sistema / Tecnología';
  if (type === 'formacion') return 'Formación';
  if (type === 'inventario_logistica') return 'Inventario / Logística';
  if (type === 'finanzas') return 'Finanzas';
  if (type === 'expansion') return 'Expansión';
  return 'General';
}

export function calculateProjectProgress(project: LunarisProject) {
  const planned = Math.min(100, project.steps.reduce((sum, step) => sum + Number(step.weight || 0), 0));
  const completed = Math.min(100, project.steps.reduce((sum, step) => (
    step.status === 'completed' ? sum + Number(step.weight || 0) : sum
  ), 0));
  return {
    planned,
    completed,
    unplanned: Math.max(0, 100 - planned),
  };
}

export function canUserSeeProject(project: LunarisProject, user?: User | null) {
  if (!user) return false;
  return (
    project.ownerId === user.id
    || project.responsibleId === user.id
    || project.participants.includes(user.id)
    || project.steps.some((step) => step.responsibleId === user.id)
  );
}

export function useProjects(currentUser?: User | null) {
  const { createMention } = useMentions(currentUser);
  const [projectsState, setProjects, isLoading] = useSharedJsonState<LunarisProject[]>(
    PROJECTS_KEY,
    [],
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      mergeStrategy: (_remote, next) => Array.isArray(next) ? next : [],
      isUsefulPayload: (payload) => Array.isArray(payload),
    },
  );

  const projects = useMemo(() => {
    const list = Array.isArray(projectsState) ? projectsState : [];
    return [...list].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [projectsState]);

  const visibleProjects = useMemo(() => (
    projects.filter((project) => canUserSeeProject(project, currentUser))
  ), [currentUser, projects]);

  const createProject = (draft: ProjectDraft, options?: { ownerId?: string; actorId?: string }) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const now = new Date().toISOString();
    const ownerId = options?.ownerId || currentUser.id;
    const actorId = options?.actorId || currentUser.id;
    const participants = Array.from(new Set([draft.responsibleId, ownerId].filter(Boolean)));
    const project: LunarisProject = {
      ...draft,
      id: uniqueId('project'),
      ownerId,
      status: 'in_progress',
      participants,
      steps: [],
      taskLinks: [],
      history: [historyEntry(actorId, 'created', `Proyecto creado: ${draft.name}`)],
      createdAt: now,
      updatedAt: now,
    };
    setProjects((prev) => [project, ...(Array.isArray(prev) ? prev : [])]);
    return project;
  };

  const updateProject = (projectId: string, patch: Partial<LunarisProject>, historyText = 'Proyecto actualizado') => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const now = new Date().toISOString();
    setProjects((prev) => (
      (Array.isArray(prev) ? prev : []).map((project) => (
        project.id === projectId
          ? {
            ...project,
            ...patch,
            participants: Array.from(new Set([...(project.participants || []), ...(patch.participants || [])])),
            history: [...(project.history || []), historyEntry(currentUser.id, 'updated', historyText)],
            updatedAt: now,
          }
          : project
      ))
    ));
  };

  const deleteProject = (projectId: string) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    setProjects((prev) => (
      (Array.isArray(prev) ? prev : []).filter((project) => project.id !== projectId)
    ));
  };

  const addStep = (projectId: string, draft: ProjectStepDraft) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const now = new Date().toISOString();
    const step: ProjectStep = {
      ...draft,
      id: uniqueId('project-step'),
      attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
      weight: Number(draft.weight || 0),
      taskIds: [],
      createdAt: now,
      updatedAt: now,
    };

    setProjects((prev) => (
      (Array.isArray(prev) ? prev : []).map((project) => (
        project.id === projectId
          ? {
            ...project,
            participants: Array.from(new Set([...(project.participants || []), step.responsibleId])),
            steps: [...(project.steps || []), step],
            history: [...(project.history || []), historyEntry(currentUser.id, 'step_added', `Paso añadido: ${step.name}`)],
            updatedAt: now,
          }
          : project
      ))
    ));
    return step;
  };

  const updateStep = (projectId: string, stepId: string, patch: Partial<ProjectStep>) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const now = new Date().toISOString();
    setProjects((prev) => (
      (Array.isArray(prev) ? prev : []).map((project) => {
        if (project.id !== projectId) return project;
        const steps = (project.steps || []).map((step) => (
          step.id === stepId
            ? { ...step, ...patch, weight: Number(patch.weight ?? step.weight ?? 0), updatedAt: now }
            : step
        ));
        const touched = steps.find((step) => step.id === stepId);
        return {
          ...project,
          steps,
          participants: patch.responsibleId
            ? Array.from(new Set([...(project.participants || []), patch.responsibleId]))
            : project.participants,
          history: [...(project.history || []), historyEntry(currentUser.id, 'step_updated', `Paso actualizado: ${touched?.name || stepId}`)],
          updatedAt: now,
        };
      })
    ));
  };

  const linkTaskToStep = (projectId: string, stepId: string | undefined, taskId: number) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const now = new Date().toISOString();
    setProjects((prev) => (
      (Array.isArray(prev) ? prev : []).map((project) => {
        if (project.id !== projectId) return project;
        const steps = (project.steps || []).map((step) => (
          step.id === stepId
            ? { ...step, taskIds: Array.from(new Set([...(step.taskIds || []), taskId])), updatedAt: now }
            : step
        ));
        return {
          ...project,
          steps,
          taskLinks: [...(project.taskLinks || []), { taskId, stepId, createdAt: now }],
          history: [...(project.history || []), historyEntry(currentUser.id, 'task_linked', `Tarea #${taskId} vinculada al proyecto`)],
          updatedAt: now,
        };
      })
    ));
  };

  const requestDecision = async (project: LunarisProject, draft: ProjectDecisionDraft) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const context = [
      `Situación: ${draft.situation}`,
      `Investigación: ${draft.research}`,
      `Opciones: ${draft.options}`,
      `Ventajas/riesgos: ${draft.risks}`,
      `Recomendación: ${draft.recommendation}`,
      `Decisión necesaria: ${draft.neededDecision}`,
    ].join('\n\n');

    const mention = await createMention({
      title: `${draft.mentionType === 'decidir' ? 'Decisión' : 'Validación'} · ${project.name}`,
      originType: 'project',
      originId: project.id,
      originLabel: project.name,
      objectPath: `/projects?project=${project.id}`,
      targetUserId: draft.targetUserId,
      mentionType: draft.mentionType,
      context,
    });

    updateProject(
      project.id,
      { participants: [draft.targetUserId] },
      `${draft.mentionType === 'decidir' ? 'Decisión' : 'Validación'} solicitada: ${draft.neededDecision}`,
    );
    return mention;
  };

  const ensureEstebanInitialPortfolio = useCallback(() => {
    const now = new Date().toISOString();
    setProjects((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existingNames = new Set(list.map((project) => String(project.name || '').toLowerCase().trim()));
      const missing = ESTEBAN_INITIAL_PORTFOLIO
        .filter((draft) => !existingNames.has(draft.name.toLowerCase().trim()))
        .map((draft): LunarisProject => ({
          ...draft,
          id: uniqueId('project'),
          ownerId: ESTEBAN_ID,
          responsibleId: ESTEBAN_ID,
          participants: [ESTEBAN_ID],
          steps: [],
          taskLinks: [],
          history: [historyEntry(ESTEBAN_ID, 'created', `Proyecto inicial creado para Esteban: ${draft.name}`)],
          createdAt: now,
          updatedAt: now,
        }));
      if (missing.length === 0) return list;
      return [...missing, ...list];
    });
  }, [setProjects]);

  return {
    projects,
    visibleProjects,
    isLoading,
    createProject,
    updateProject,
    deleteProject,
    addStep,
    updateStep,
    linkTaskToStep,
    requestDecision,
    ensureEstebanInitialPortfolio,
  };
}
