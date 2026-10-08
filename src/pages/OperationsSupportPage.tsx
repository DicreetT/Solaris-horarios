import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckSquare, Clock, FolderKanban, MessageSquareText, Plus, Send, Trash2, UserCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ESTEBAN_ID, USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { calculateProjectProgress, projectStatusLabel, useProjects } from '../hooks/useProjects';
import { useTodos } from '../hooks/useTodos';
import { getWeekDateKeys, getWeekStartKey, WeeklyWorkBlockKind, useWeeklyWorkPlans } from '../hooks/useWeeklyWorkPlans';
import type { WeeklyWorkBlock } from '../hooks/useWeeklyWorkPlans';

const FER_ID = '4ca49a9d-7ee5-4b54-8e93-bc4833de549a';

const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const PREVIEW_ROLE_TO_USER_NAME: Record<string, string> = {
  direction: 'Thalia',
  sales: 'Itzi',
  warehouse: 'Anabella',
  finance: 'Heidy',
  operations: 'Esteban',
  support: 'Fer',
};

function userName(id?: string | null) {
  return USERS.find((user) => user.id === id)?.name || 'Usuario';
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function blockKindLabel(kind: WeeklyWorkBlockKind) {
  if (kind === 'warehouse') return 'Almacén';
  if (kind === 'support') return 'Apoyo';
  if (kind === 'admin') return 'Gestión';
  return 'Proyectos';
}

function blockKindClass(kind: WeeklyWorkBlockKind) {
  if (kind === 'warehouse') return 'border-teal-200 bg-teal-50 text-teal-800';
  if (kind === 'support') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (kind === 'admin') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-indigo-200 bg-indigo-50 text-indigo-800';
}

function isDueThisWeek(dateKey: string | null | undefined, weekDays: string[]) {
  return !!dateKey && weekDays.includes(dateKey);
}

export default function OperationsSupportPage() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get('view') || 'operaciones';
  const isOperationsView = viewMode === 'operaciones';
  const requestedDay = searchParams.get('day') || '';
  const [previewRoleKey, setPreviewRoleKey] = useState<string | null>(() => (
    typeof window === 'undefined' ? null : window.localStorage.getItem('lunaris_role_preview')
  ));
  const effectiveUser = useMemo(() => {
    if (!currentUser?.isAdmin || !previewRoleKey) return currentUser || null;
    const previewName = PREVIEW_ROLE_TO_USER_NAME[previewRoleKey];
    return USERS.find((user) => user.name === previewName) || currentUser;
  }, [currentUser, previewRoleKey]);
  const { projects, visibleProjects, addStep } = useProjects(currentUser);
  const { todos } = useTodos(currentUser);
  const { addNotification } = useNotifications(currentUser || null);
  const { blocks, addBlock, updateBlock, deleteBlock } = useWeeklyWorkPlans(currentUser);
  const [weekStart, setWeekStart] = useState(getWeekStartKey());
  const weekDays = useMemo(() => getWeekDateKeys(weekStart), [weekStart]);
  const [selectedUserId, setSelectedUserId] = useState(() => {
    if (currentUser?.id === FER_ID) return FER_ID;
    if (currentUser?.id === ESTEBAN_ID) return FER_ID;
    return currentUser?.isAdmin ? FER_ID : currentUser?.id || FER_ID;
  });
  const [blockDraft, setBlockDraft] = useState({
    dateKey: weekDays[0] || weekStart,
    startTime: '08:00',
    endTime: '12:00',
    kind: 'warehouse' as WeeklyWorkBlockKind,
    title: '',
    projectId: '',
    notes: '',
  });
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    projectId: '',
    dueDate: weekDays[0] || weekStart,
    startTime: '09:00',
    endTime: '10:00',
  });
  const [supportRequestDraft, setSupportRequestDraft] = useState({
    title: '',
    dateKey: weekDays[0] || weekStart,
    startTime: '12:00',
    endTime: '13:00',
    notes: '',
  });
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [stepDraft, setStepDraft] = useState({
    projectId: '',
    name: '',
    targetDate: weekDays[4] || weekStart,
    deliverable: '',
    weight: 10,
    description: '',
  });

  React.useEffect(() => {
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

  React.useEffect(() => {
    setBlockDraft((prev) => ({ ...prev, dateKey: weekDays.includes(prev.dateKey) ? prev.dateKey : weekDays[0] || weekStart }));
    setTaskDraft((prev) => ({ ...prev, dueDate: weekDays.includes(prev.dueDate) ? prev.dueDate : weekDays[0] || weekStart }));
    setSupportRequestDraft((prev) => ({ ...prev, dateKey: weekDays.includes(prev.dateKey) ? prev.dateKey : weekDays[0] || weekStart }));
    setStepDraft((prev) => ({ ...prev, targetDate: weekDays.includes(prev.targetDate) ? prev.targetDate : weekDays[4] || weekStart }));
  }, [weekDays.join('|'), weekStart]);

  React.useEffect(() => {
    if (!requestedDay) return;
    setWeekStart(getWeekStartKey(new Date(`${requestedDay}T00:00:00`)));
    setBlockDraft((prev) => ({ ...prev, dateKey: requestedDay }));
  }, [requestedDay]);

  const isAdminPreviewMode = !!currentUser?.isAdmin && !!previewRoleKey;
  const canCoordinateFer = (!isAdminPreviewMode && !!currentUser?.isAdmin) || effectiveUser?.id === ESTEBAN_ID;
  const canPlanFerWeek = canCoordinateFer || effectiveUser?.id === FER_ID;
  const isSupportRequestOnly = viewMode === 'solicitud-apoyo' && !canCoordinateFer;
  const isCoordinatorSupportView = viewMode === 'solicitud-apoyo' && canCoordinateFer;
  const isDeliverablesView = viewMode === 'entregables';
  const isFerWeeklyView = viewMode === 'jornada';
  const availableUsers = isOperationsView
    ? USERS.filter((user) => user.id === ESTEBAN_ID)
    : (isFerWeeklyView || isDeliverablesView || isCoordinatorSupportView)
      ? USERS.filter((user) => user.id === FER_ID)
      : USERS.filter((user) => user.id === effectiveUser?.id);

  React.useEffect(() => {
    if (isOperationsView && canCoordinateFer) {
      setSelectedUserId(ESTEBAN_ID);
      return;
    }
    if (isFerWeeklyView || isDeliverablesView || isCoordinatorSupportView) {
      setSelectedUserId(FER_ID);
      return;
    }
    if (effectiveUser?.id) {
      setSelectedUserId(effectiveUser.id);
    }
  }, [canCoordinateFer, effectiveUser?.id, isCoordinatorSupportView, isDeliverablesView, isFerWeeklyView, isOperationsView]);

  const selectedBlocks = blocks.filter((block) => block.userId === selectedUserId && block.weekStart === weekStart);
  const mySupportRequests = blocks.filter((block) => block.userId === FER_ID && block.requesterId === effectiveUser?.id && block.kind === 'support');
  const allSupportRequests = blocks
    .filter((block) => block.userId === FER_ID && block.kind === 'support')
    .sort((a, b) => (a.priorityRank ?? 999) - (b.priorityRank ?? 999) || a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime));
  const selectedUserTasks = todos.filter((todo) => (todo.assigned_to || []).includes(selectedUserId));
  const weekTasks = selectedUserTasks.filter((todo) => isDueThisWeek(todo.due_date_key, weekDays));
  const pendingWeekTasks = weekTasks.filter((todo) => !(todo.completed_by || []).includes(selectedUserId));

  const operationProjects = projects.filter((project) => (
    project.responsibleId === ESTEBAN_ID
    || project.participants.includes(ESTEBAN_ID)
    || project.participants.includes(FER_ID)
    || project.steps.some((step) => step.responsibleId === FER_ID || step.responsibleId === ESTEBAN_ID)
  ));
  const visibleOperationProjects = operationProjects.filter((project) => (
    currentUser?.isAdmin || visibleProjects.some((visibleProject) => visibleProject.id === project.id) || currentUser?.id === ESTEBAN_ID || currentUser?.id === FER_ID
  ));
  const ferProjects = visibleOperationProjects.filter((project) => (
    project.participants.includes(FER_ID) || project.steps.some((step) => step.responsibleId === FER_ID)
  ));
  const activeSupportRequests = allSupportRequests.slice(0, 3);
  const activeSupportProjectIds = activeSupportRequests.map((request) => request.projectId).filter(Boolean);
  const activeFerProjects = ferProjects.filter((project) => activeSupportProjectIds.includes(project.id)).slice(0, 3);
  const displayActiveFerProjects = activeFerProjects.length > 0 ? activeFerProjects : ferProjects.slice(0, 3);
  const pendingFerProjects = ferProjects.slice(3);
  const selectedUserProjects = visibleOperationProjects.filter((project) => (
    project.responsibleId === selectedUserId
    || project.participants.includes(selectedUserId)
    || project.steps.some((step) => step.responsibleId === selectedUserId)
  ));

  const deliverables = [
    ...selectedUserProjects.flatMap((project) => project.steps
      .filter((step) => step.responsibleId === selectedUserId && step.targetDate && isDueThisWeek(step.targetDate, weekDays))
      .map((step) => ({
        id: `${project.id}-${step.id}`,
        title: step.deliverable || step.name,
        source: project.name,
        date: step.targetDate || '',
        done: step.status === 'completed',
      }))),
    ...weekTasks.map((todo) => ({
      id: `todo-${todo.id}`,
      title: todo.title,
      source: 'Tarea',
      date: todo.due_date_key || '',
      done: (todo.completed_by || []).includes(selectedUserId),
    })),
  ];

  const weeklyProgress = deliverables.length === 0
    ? 0
    : Math.round((deliverables.filter((item) => item.done).length / deliverables.length) * 100);

  const handleAddBlock = (event: React.FormEvent) => {
    event.preventDefault();
    if (!blockDraft.title.trim()) return;
    addBlock({
      userId: selectedUserId,
      weekStart,
      dateKey: blockDraft.dateKey,
      startTime: blockDraft.startTime,
      endTime: blockDraft.endTime,
      kind: blockDraft.kind,
      title: blockDraft.title.trim(),
      projectId: blockDraft.projectId || undefined,
      requesterId: currentUser?.id,
      notes: blockDraft.notes,
      updatedBy: currentUser?.id,
    });
    setBlockDraft((prev) => ({ ...prev, title: '', notes: '' }));
  };

  const prepareBlockForDay = (dayKey: string) => {
    setBlockDraft((prev) => ({ ...prev, dateKey: dayKey, title: '' }));
    setTimeout(() => document.getElementById('add-weekly-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };

  const handleCreateFerTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskDraft.title.trim()) return;
    const project = visibleOperationProjects.find((item) => item.id === taskDraft.projectId);
    const request = addBlock({
      userId: FER_ID,
      weekStart: getWeekStartKey(new Date(`${taskDraft.dueDate || weekStart}T00:00:00`)),
      dateKey: taskDraft.dueDate || weekDays[0] || weekStart,
      startTime: taskDraft.startTime,
      endTime: taskDraft.endTime,
      kind: 'support',
      title: taskDraft.title.trim(),
      projectId: taskDraft.projectId || undefined,
      requesterId: effectiveUser?.id || ESTEBAN_ID,
      priorityRank: allSupportRequests.length + 1,
      notes: project ? `Asignado por Esteban · Proyecto: ${project.name}` : 'Asignado por Esteban',
      updatedBy: currentUser?.id,
    });
    notifySupportPeople([FER_ID, ESTEBAN_ID], `Nueva solicitud de apoyo a Fer: ${request.title}`);
    setTaskDraft((prev) => ({ ...prev, title: '' }));
  };

  const moveSupportRequest = (requestId: string, direction: -1 | 1) => {
    const currentIndex = allSupportRequests.findIndex((request) => request.id === requestId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= allSupportRequests.length) return;
    allSupportRequests.forEach((request, index) => {
      updateBlock(request.id, { priorityRank: index + 1 });
    });
    const current = allSupportRequests[currentIndex];
    const target = allSupportRequests[nextIndex];
    updateBlock(current.id, { priorityRank: nextIndex + 1 });
    updateBlock(target.id, { priorityRank: currentIndex + 1 });
  };

  const notifySupportPeople = (userIds: Array<string | undefined>, message: string) => {
    Array.from(new Set(userIds.filter(Boolean))).forEach((userId) => {
      if (!userId || userId === currentUser?.id) return;
      void addNotification({ userId, type: 'action_required', message }).catch((): void => undefined);
    });
  };

  const handleAddSupportComment = (requestId: string) => {
    const text = (supportReplyDrafts[requestId] || '').trim();
    if (!text || !currentUser?.id) return;
    const request = allSupportRequests.find((item) => item.id === requestId) || mySupportRequests.find((item) => item.id === requestId);
    if (!request) return;
    const authorId = effectiveUser?.id || currentUser.id;
    const comment = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `support-comment-${Date.now()}`,
      userId: authorId,
      text,
      createdAt: new Date().toISOString(),
    };
    updateBlock(request.id, { comments: [...(request.comments || []), comment] });
    setSupportReplyDrafts((prev) => ({ ...prev, [requestId]: '' }));

    const requesterIsAuthor = request.requesterId === authorId;
    notifySupportPeople(
      requesterIsAuthor ? [FER_ID, ESTEBAN_ID] : [request.requesterId, authorId === FER_ID ? ESTEBAN_ID : FER_ID],
      `Nueva respuesta en solicitud de apoyo: ${request.title}`,
    );
  };

  const handleAddFerStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (!stepDraft.projectId || !stepDraft.name.trim()) return;
    addStep(stepDraft.projectId, {
      name: stepDraft.name.trim(),
      description: stepDraft.description.trim(),
      responsibleId: selectedUserId,
      targetDate: stepDraft.targetDate || undefined,
      deliverable: stepDraft.deliverable.trim() || stepDraft.name.trim(),
      attachments: [],
      weight: Number(stepDraft.weight || 0),
      status: 'pending',
    });
    setStepDraft((prev) => ({ ...prev, name: '', deliverable: '', description: '', weight: 10 }));
  };

  const supportRequestSection = (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <UserCheck size={18} className="text-emerald-700" />
        <h2 className="text-xl font-black text-slate-950">Solicitar apoyo a Fer</h2>
      </div>
      <p className="text-sm font-semibold text-slate-500">
        Pide apoyo operativo para un día y hora concretos. Esteban lo revisa y lo encaja en la planificación.
      </p>
      <form onSubmit={handleCreateSupportRequest} className="mt-4 grid gap-2 md:grid-cols-2">
        <input value={supportRequestDraft.title} onChange={(event) => setSupportRequestDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Solicitud de apoyo" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold md:col-span-2" />
        <input type="date" value={supportRequestDraft.dateKey} onChange={(event) => setSupportRequestDraft((prev) => ({ ...prev, dateKey: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
        <div className="grid grid-cols-2 gap-2">
          <input type="time" value={supportRequestDraft.startTime} onChange={(event) => setSupportRequestDraft((prev) => ({ ...prev, startTime: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <input type="time" value={supportRequestDraft.endTime} onChange={(event) => setSupportRequestDraft((prev) => ({ ...prev, endTime: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
        </div>
        <textarea value={supportRequestDraft.notes} onChange={(event) => setSupportRequestDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notas o contexto" className="min-h-[72px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold md:col-span-2" />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-black text-white hover:bg-emerald-800 md:col-span-2">
          <Send size={15} />
          Solicitar apoyo
        </button>
      </form>
      <div className="mt-5 space-y-2">
        <h3 className="text-sm font-black text-slate-900">Mis solicitudes enviadas</h3>
        {mySupportRequests.slice(0, 6).map((request) => (
          <SupportRequestCard
            key={request.id}
            request={request}
            replyValue={supportReplyDrafts[request.id] || ''}
            onReplyChange={(value) => setSupportReplyDrafts((prev) => ({ ...prev, [request.id]: value }))}
            onAddReply={() => handleAddSupportComment(request.id)}
          />
        ))}
        {mySupportRequests.length === 0 && <p className="text-sm font-semibold text-slate-500">Aún no has enviado solicitudes de apoyo.</p>}
      </div>
    </section>
  );

  if (isSupportRequestOnly && effectiveUser?.id === FER_ID) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-8">
        <header className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Mis solicitudes</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Solicitudes de apoyo a Fer</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Aquí ves quién pidió apoyo, cuándo lo necesita y puedes responder para coordinar.
          </p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            {allSupportRequests.map((request, index) => (
              <SupportRequestCard
                key={request.id}
                request={request}
                isActive={index < 3}
                replyValue={supportReplyDrafts[request.id] || ''}
                onReplyChange={(value) => setSupportReplyDrafts((prev) => ({ ...prev, [request.id]: value }))}
                onAddReply={() => handleAddSupportComment(request.id)}
              />
            ))}
            {allSupportRequests.length === 0 && <p className="text-sm font-semibold text-slate-500">Aún no hay solicitudes de apoyo para ti.</p>}
          </div>
        </section>
      </div>
    );
  }

  if (isSupportRequestOnly) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-8">
        <header className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Solicitud de apoyo</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Apoyo de Fer</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Esta vista solo crea la solicitud. La jornada semanal de Fer queda separada para Fer y Esteban.
          </p>
        </header>
        {supportRequestSection}
      </div>
    );
  }

  function handleCreateSupportRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!supportRequestDraft.title.trim()) return;
    const request = addBlock({
      userId: FER_ID,
      weekStart: getWeekStartKey(new Date(`${supportRequestDraft.dateKey}T00:00:00`)),
      dateKey: supportRequestDraft.dateKey,
      startTime: supportRequestDraft.startTime,
      endTime: supportRequestDraft.endTime,
      kind: 'support',
      title: supportRequestDraft.title.trim(),
      requesterId: effectiveUser?.id,
      priorityRank: allSupportRequests.length + 1,
      notes: supportRequestDraft.notes,
      updatedBy: currentUser?.id,
    });
    notifySupportPeople([FER_ID, ESTEBAN_ID], `Nueva solicitud de apoyo a Fer: ${request.title}`);
    setSupportRequestDraft((prev) => ({ ...prev, title: '', notes: '' }));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <header className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Fase 9 · Operaciones</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">
              {isCoordinatorSupportView
                ? 'Soporte operativo de Fer'
                : isDeliverablesView
                  ? 'Entregables de Fer'
                  : isOperationsView
                    ? 'Operaciones de Esteban'
                    : 'Jornada semanal de Fer'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              {isOperationsView
                ? 'Esteban organiza sus bloques, sus entregables y el apoyo operativo que necesita coordinar con Fer.'
                : 'Esteban coordina prioridades; Fer ve sus bloques de trabajo, solicitudes de apoyo y entregables sin entrar en el espacio de Esteban.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(getWeekStartKey(new Date(`${event.target.value}T00:00:00`)))}
              className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-black text-slate-700"
            />
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-black text-slate-700">
              {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={CheckSquare} label="Pendientes semana" value={String(pendingWeekTasks.length)} />
        <MetricCard icon={FolderKanban} label={isOperationsView ? 'Proyectos Esteban' : 'Proyectos Fer'} value={String(selectedUserProjects.length)} />
        <MetricCard icon={Clock} label="Bloques planificados" value={String(selectedBlocks.length)} />
        <MetricCard icon={UserCheck} label="Progreso semanal" value={`${weeklyProgress}%`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <main className="space-y-6">
          {!isCoordinatorSupportView && !isDeliverablesView && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays size={18} className="text-emerald-700" />
              <h2 className="text-xl font-black text-slate-950">Plan semanal de {userName(selectedUserId)}</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-5">
              {weekDays.map((dayKey, index) => {
                const dayBlocks = selectedBlocks.filter((block) => block.dateKey === dayKey);
                return (
                  <div key={dayKey} className="min-h-[220px] rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{WEEKDAY_LABELS[index]}</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{dayKey}</p>
                    <div className="mt-3 space-y-2">
                      {dayBlocks.map((block) => (
                        <div key={block.id} className={classNames('rounded-lg border p-2 text-xs font-bold', blockKindClass(block.kind))}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-black">{block.startTime}-{block.endTime}</p>
                              <p className="mt-1">{block.title}</p>
                              <p className="mt-1 opacity-80">{blockKindLabel(block.kind)}</p>
                            </div>
                            {canPlanFerWeek && (
                              <button type="button" onClick={() => deleteBlock(block.id)} className="rounded-md p-1 hover:bg-white/70" aria-label="Eliminar bloque">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {dayBlocks.length === 0 && <p className="text-xs font-semibold text-slate-400">Sin bloques.</p>}
                    </div>
                    {canPlanFerWeek && (
                      <button
                        type="button"
                        onClick={() => prepareBlockForDay(dayKey)}
                        className="mt-3 w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs font-black text-emerald-800 hover:bg-emerald-50"
                      >
                        Agregar bloque
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>}

          {!canCoordinateFer && !isDeliverablesView && !isFerWeeklyView && supportRequestSection}

          {canPlanFerWeek && !isCoordinatorSupportView && !isDeliverablesView && (
            <section className={classNames('grid gap-4', canCoordinateFer ? 'lg:grid-cols-2' : 'lg:grid-cols-1')}>
              <form id="add-weekly-block" onSubmit={handleAddBlock} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-slate-950">Añadir bloque de jornada</h2>
                <div className="mt-4 grid gap-2">
                  <select value={blockDraft.dateKey} onChange={(event) => setBlockDraft((prev) => ({ ...prev, dateKey: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    {weekDays.map((dayKey, index) => <option key={dayKey} value={dayKey}>{WEEKDAY_LABELS[index]} · {dayKey}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="time" value={blockDraft.startTime} onChange={(event) => setBlockDraft((prev) => ({ ...prev, startTime: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                    <input type="time" value={blockDraft.endTime} onChange={(event) => setBlockDraft((prev) => ({ ...prev, endTime: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  </div>
                  <select value={blockDraft.kind} onChange={(event) => setBlockDraft((prev) => ({ ...prev, kind: event.target.value as WeeklyWorkBlockKind }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    <option value="warehouse">Almacén</option>
                    <option value="projects">Proyectos</option>
                    <option value="support">Apoyo</option>
                    <option value="admin">Gestión</option>
                  </select>
                  <input value={blockDraft.title} onChange={(event) => setBlockDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Qué hará en este bloque" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  <select value={blockDraft.projectId} onChange={(event) => setBlockDraft((prev) => ({ ...prev, projectId: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    <option value="">Sin proyecto asociado</option>
                    {visibleOperationProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <textarea value={blockDraft.notes} onChange={(event) => setBlockDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notas" className="min-h-[72px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                  <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-black text-white hover:bg-emerald-800">
                    <Plus size={15} />
                    Añadir bloque
                  </button>
                </div>
              </form>

              {canCoordinateFer && !isFerWeeklyView && <form onSubmit={handleCreateFerTask} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-slate-950">Asignar trabajo a Fer</h2>
                <div className="mt-4 grid gap-2">
                  <input value={taskDraft.title} onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Qué necesita hacer Fer" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  <select value={taskDraft.projectId} onChange={(event) => setTaskDraft((prev) => ({ ...prev, projectId: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    <option value="">Sin proyecto asociado</option>
                    {visibleOperationProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <div className="grid grid-cols-1 gap-2">
                    <input type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft((prev) => ({ ...prev, dueDate: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="time" value={taskDraft.startTime} onChange={(event) => setTaskDraft((prev) => ({ ...prev, startTime: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                    <input type="time" value={taskDraft.endTime} onChange={(event) => setTaskDraft((prev) => ({ ...prev, endTime: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  </div>
                  <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-sm font-black text-white hover:bg-indigo-800">
                    <Plus size={15} />
                    Crear solicitud para Fer
                  </button>
                </div>
              </form>}
            </section>
          )}

          {isCoordinatorSupportView && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Solicitudes de apoyo para Fer</h2>
              <div className="mt-4 space-y-2">
                {allSupportRequests.map((request, index) => (
                  <div key={request.id} className={classNames('rounded-xl border p-3', index < 3 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <SupportRequestCard
                          request={request}
                          isActive={index < 3}
                          replyValue={supportReplyDrafts[request.id] || ''}
                          onReplyChange={(value) => setSupportReplyDrafts((prev) => ({ ...prev, [request.id]: value }))}
                          onAddReply={() => handleAddSupportComment(request.id)}
                          bare
                        />
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" onClick={() => moveSupportRequest(request.id, -1)} disabled={index === 0} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 disabled:opacity-40">
                          Subir
                        </button>
                        <button type="button" onClick={() => moveSupportRequest(request.id, 1)} disabled={index === allSupportRequests.length - 1} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 disabled:opacity-40">
                          Bajar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {allSupportRequests.length === 0 && <p className="text-sm font-semibold text-slate-500">No hay solicitudes de apoyo pendientes.</p>}
              </div>
            </section>
          )}
        </main>

        <aside className="space-y-6">
          {isDeliverablesView && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Añadir siguiente paso</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Fer puede registrar el siguiente paso que le corresponde dentro de un proyecto y asignarle peso de avance.
              </p>
              <form onSubmit={handleAddFerStep} className="mt-4 grid gap-2">
                <select value={stepDraft.projectId} onChange={(event) => setStepDraft((prev) => ({ ...prev, projectId: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                  <option value="">Seleccionar proyecto</option>
                  {ferProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
                <input value={stepDraft.name} onChange={(event) => setStepDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre del siguiente paso" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                <input value={stepDraft.deliverable} onChange={(event) => setStepDraft((prev) => ({ ...prev, deliverable: event.target.value }))} placeholder="Entregable esperado" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={stepDraft.targetDate} onChange={(event) => setStepDraft((prev) => ({ ...prev, targetDate: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  <input type="number" min="0" max="100" value={stepDraft.weight} onChange={(event) => setStepDraft((prev) => ({ ...prev, weight: Number(event.target.value) }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                </div>
                <textarea value={stepDraft.description} onChange={(event) => setStepDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="Observaciones o contexto" className="min-h-[72px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-black text-white hover:bg-emerald-800">
                  <Plus size={15} />
                  Añadir siguiente paso
                </button>
              </form>
            </section>
          )}

          {(isDeliverablesView || isOperationsView) && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Mis entregables de la semana</h2>
            <div className="mt-4 space-y-2">
              {deliverables.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{item.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{item.source} · {item.date || 'sin fecha'}</p>
                    </div>
                    <span className={classNames('rounded-full border px-2 py-0.5 text-[11px] font-black', item.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>
                      {item.done ? 'Hecho' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              ))}
              {deliverables.length === 0 && <p className="text-sm font-semibold text-slate-500">No hay entregables con fecha esta semana.</p>}
            </div>
          </section>}

          {isDeliverablesView && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Proyectos en los que participa</h2>
            {displayActiveFerProjects.length > 0 && (
              <p className="mt-1 text-xs font-black uppercase tracking-wide text-emerald-700">Activos para esta semana</p>
            )}
            <div className="mt-4 space-y-2">
              {displayActiveFerProjects.map((project) => {
                const progress = calculateProjectProgress(project);
                return (
                  <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-black text-slate-950">{project.name}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{projectStatusLabel(project.status)} · {progress.completed}%</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress.completed}%` }} />
                    </div>
                  </div>
                );
              })}
              {ferProjects.length === 0 && <p className="text-sm font-semibold text-slate-500">Fer aún no está vinculado a proyectos visibles.</p>}
            </div>
            {pendingFerProjects.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Solicitados / en espera</p>
                <div className="mt-3 space-y-2">
                  {pendingFerProjects.map((project) => (
                    <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-black text-slate-950">{project.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{projectStatusLabel(project.status)}</p>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </section>
          }

          {!isDeliverablesView && !isCoordinatorSupportView && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Solicitudes de apoyo a Fer</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Las tres primeras son las activas para Fer esta semana.</p>
            <div className="mt-4 space-y-2">
              {allSupportRequests.slice(0, 8).map((request, index) => (
                <SupportRequestCard
                  key={request.id}
                  request={request}
                  isActive={index < 3}
                  replyValue={supportReplyDrafts[request.id] || ''}
                  onReplyChange={(value) => setSupportReplyDrafts((prev) => ({ ...prev, [request.id]: value }))}
                  onAddReply={() => handleAddSupportComment(request.id)}
                />
              ))}
              {allSupportRequests.length === 0 && <p className="text-sm font-semibold text-slate-500">No hay solicitudes de apoyo registradas.</p>}
            </div>
          </section>}
        </aside>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4 text-emerald-800 shadow-sm">
      <Icon size={20} />
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="text-xs font-black uppercase tracking-wide">{label}</p>
    </div>
  );
}

function SupportRequestCard({
  request,
  isActive = false,
  replyValue,
  onReplyChange,
  onAddReply,
  bare = false,
}: {
  request: WeeklyWorkBlock;
  isActive?: boolean;
  replyValue: string;
  onReplyChange: (value: string) => void;
  onAddReply: () => void;
  bare?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{request.title}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {request.dateKey} · {request.startTime}-{request.endTime} · pidió {userName(request.requesterId)}
          </p>
        </div>
        {isActive && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">Activa</span>}
      </div>

      {request.notes && <p className="mt-2 text-sm font-semibold leading-5 text-slate-600">{request.notes}</p>}

      {(request.comments || []).length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {(request.comments || []).slice(-4).map((comment) => (
            <div key={comment.id} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
              <p className="font-black text-slate-800">{userName(comment.userId)}</p>
              <p className="mt-1 font-semibold leading-5 text-slate-600">{comment.text}</p>
              <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-slate-400">{new Date(comment.createdAt).toLocaleString('es-ES')}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <textarea
          value={replyValue}
          onChange={(event) => onReplyChange(event.target.value)}
          placeholder="Responder u observar esta solicitud"
          className="min-h-[58px] resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-300"
        />
        <button
          type="button"
          onClick={onAddReply}
          disabled={!replyValue.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MessageSquareText size={14} />
          Responder
        </button>
      </div>
    </>
  );

  if (bare) return <div>{content}</div>;
  return (
    <div className={classNames('rounded-xl border p-3', isActive ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
      {content}
    </div>
  );
}
