import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  MessageCircle,
  Plus,
  Paperclip,
  Sparkles,
  Send,
  Users,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { useTaskCommentSeen } from '../hooks/useTaskCommentSeen';
import { USERS } from '../constants';
import { FileUploader } from '../components/FileUploader';
import LinkifiedText from '../components/LinkifiedText';
import { UserAvatar } from '../components/UserAvatar';
import { Todo, type Attachment, type Comment } from '../types';
import TodoModal from '../components/TodoModal';

const PRIORITY_TAG = '__priority__';

function personName(id: string) {
  return USERS.find((u) => u.id === id)?.name || id;
}

function formatDueDate(dueDateKey?: string) {
  if (!dueDateKey) return 'Sin fecha';
  const parsed = new Date(`${dueDateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dueDateKey;
  return parsed.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function formatCreatedAt(createdAt: string) {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return createdAt;
  return parsed.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function toMillis(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDoneForUser(task: Todo, userId: string) {
  return task.completed_by.includes(userId);
}

function isUrgentForUser(task: Todo, currentUserId: string) {
  const isDoneForMe = isDoneForUser(task, currentUserId);
  if (isDoneForMe) return false;

  const isPriority = (task.tags || []).includes(PRIORITY_TAG);
  const isShocked = !!task.shocked_users?.includes(currentUserId);

  return isShocked || isPriority;
}

function getTaskPriority(task: Todo, currentUserId: string) {
  const isDoneForMe = isDoneForUser(task, currentUserId);
  const isAssignedToMe = task.assigned_to.includes(currentUserId);
  const isCreator = task.created_by === currentUserId;
  const urgent = isUrgentForUser(task, currentUserId);

  if (urgent) return 0;
  if (isAssignedToMe && !isDoneForMe) return 1;
  if (isCreator && !isDoneForMe) return 2;
  if (isAssignedToMe && isDoneForMe) return 3;
  return 4;
}

function sortTasks(tasks: Todo[], currentUserId: string) {
  return [...tasks].sort((a, b) => {
    const pA = getTaskPriority(a, currentUserId);
    const pB = getTaskPriority(b, currentUserId);
    if (pA !== pB) return pA - pB;

    const createdA = toMillis(a.created_at);
    const createdB = toMillis(b.created_at);
    if (createdA !== createdB) return createdB - createdA;

    if (a.due_date_key && b.due_date_key) return a.due_date_key.localeCompare(b.due_date_key);
    if (a.due_date_key) return -1;
    if (b.due_date_key) return 1;
    return 0;
  });
}

function isUrgent(task: Todo, currentUserId: string) {
  return isUrgentForUser(task, currentUserId);
}

function isGloballyDone(task: Todo) {
  return task.assigned_to.length > 0 && task.assigned_to.every((uid) => task.completed_by.includes(uid));
}

function TaskPoster({
  task,
  currentUserId,
  unreadCommentsCount,
  isCreator,
  onOpen,
  onToggleMine,
  onDelete,
}: {
  task: Todo;
  currentUserId: string;
  unreadCommentsCount: number;
  isCreator: boolean;
  onOpen: (task: Todo) => void;
  onToggleMine: (task: Todo) => void;
  onDelete?: (task: Todo) => void;
}) {
  const isDoneForMe = task.completed_by.includes(currentUserId);
  const isMine = task.assigned_to.includes(currentUserId);
  const isPriority = (task.tags || []).includes(PRIORITY_TAG);
  const isShocked = !!task.shocked_users?.includes(currentUserId) && !isDoneForMe;
  const creator = personName(task.created_by);
  const assignees = task.assigned_to.map((uid) => ({
    id: uid,
    name: personName(uid),
    done: task.completed_by.includes(uid),
  }));
  const completedCount = task.completed_by.length;
  const totalCount = task.assigned_to.length;
  const tags = (task.tags || []).filter((tag) => tag !== PRIORITY_TAG);
  const isFullyDone = isGloballyDone(task);

  return (
    <article
      className={`snap-start w-[330px] shrink-0 rounded-[2rem] border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${
        isShocked && !isFullyDone
          ? 'border-red-300 bg-gradient-to-br from-white via-red-50 to-rose-100 shadow-[0_0_0_1px_rgba(239,68,68,0.18),0_20px_40px_-20px_rgba(239,68,68,0.45)]'
          : isDoneForMe
            ? 'border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-teal-50'
            : isPriority
              ? 'border-red-300 bg-white shadow-[0_0_0_1px_rgba(239,68,68,0.10)]'
            : 'border-slate-200 bg-gradient-to-br from-white via-slate-50 to-violet-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Tarea</p>
          <h3 className="mt-1 line-clamp-2 text-lg font-black leading-tight text-slate-950">{task.title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Creada por {creator}</p>
        </div>
        <div
          className={`rounded-2xl p-2 ${
            isShocked && !isFullyDone
              ? 'bg-red-500/15 text-red-600'
              : isPriority
                ? 'bg-red-50 text-red-500'
                : 'bg-violet-100 text-violet-700'
          }`}
        >
          {isShocked && !isFullyDone ? (
            <BellRing size={18} className="animate-pulse" />
          ) : isPriority ? (
            <BellRing size={18} />
          ) : (
            <Sparkles size={18} />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isShocked && !isFullyDone && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-black text-white">
            <Flame size={11} />
            Relámpago
          </span>
        )}
        {!isShocked && isPriority && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-700">
            <BellRing size={11} />
            Prioritaria
          </span>
        )}
        {unreadCommentsCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
            <MessageCircle size={11} />
            {unreadCommentsCount} nuevo{unreadCommentsCount > 1 ? 's' : ''}
          </span>
        )}
        {task.due_date_key && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-black text-slate-700 shadow-sm">
            <Calendar size={11} />
            {formatDueDate(task.due_date_key)}
          </span>
        )}
      </div>

      <div className="mt-4 rounded-[1.5rem] border border-white/80 bg-white/75 p-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
          <span>Progreso</span>
          <span className="text-slate-900">{completedCount}/{totalCount || 0}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${isShocked ? 'bg-red-500' : isDoneForMe ? 'bg-emerald-500' : 'bg-violet-500'}`}
            style={{ width: `${totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {assignees.map((assignee) => (
            <span
              key={`${task.id}-${assignee.id}`}
              className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                assignee.done
                  ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                  : 'border-slate-200 bg-slate-100 text-slate-700'
              }`}
            >
              {assignee.name}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-sm">
            <Calendar size={11} />
            Creada {formatCreatedAt(task.created_at)}
          </span>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((tag) => (
            <span key={`${task.id}-${tag}`} className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 shadow-sm">
              #{tag}
            </span>
          ))}
        </div>
      )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(task)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Abrir
          <ArrowRight size={14} />
        </button>
        {isMine && (
          <button
            type="button"
            onClick={() => onToggleMine(task)}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold ${
              isDoneForMe
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            {isDoneForMe ? <CheckCircle2 size={14} /> : <Users size={14} />}
            {isDoneForMe ? 'Hecha' : 'Marcar mía'}
          </button>
        )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
        <span>{task.assigned_to.length} asignado(s)</span>
        <div className="flex items-center gap-2">
          {isCreator && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-black text-slate-500 hover:bg-rose-50 hover:text-rose-700"
              title="Borrar tarea"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function TaskRail({
  title,
  subtitle,
  tasks,
  currentUserId,
  unreadCommentsByTask,
  onOpenTask,
  onToggleMine,
  onDeleteTask,
  tone,
  isOpen,
  onToggleOpen,
}: {
  title: string;
  subtitle: string;
  tasks: Todo[];
  currentUserId: string;
  unreadCommentsByTask: Map<number, number>;
  onOpenTask: (task: Todo) => void;
  onToggleMine: (task: Todo) => void;
  onDeleteTask: (task: Todo) => void;
  tone: 'violet' | 'amber' | 'emerald' | 'sky';
  isOpen: boolean;
  onToggleOpen: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    railRef.current?.scrollBy({ left: dir * 380, behavior: 'smooth' });
  };
  const toneClasses = {
    violet: 'border-violet-200 bg-violet-50/70 text-violet-700',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-700',
    sky: 'border-sky-200 bg-sky-50/70 text-sky-700',
  };

  return (
    <section className={`rounded-[2rem] border ${toneClasses[tone]} p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onToggleOpen} className="text-left">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] opacity-70">Vista carrusel</p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-950">{title}</h2>
            <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-black text-slate-600 shadow-sm">
              {tasks.length}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="rounded-2xl border border-white/70 bg-white px-3 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
            aria-label="Desplazar a la izquierda"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="rounded-2xl border border-white/70 bg-white px-3 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
            aria-label="Desplazar a la derecha"
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            className="rounded-2xl border border-white/70 bg-white px-3 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
            aria-label={isOpen ? 'Contraer sección' : 'Desplegar sección'}
          >
            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          ref={railRef}
          className="mt-4 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent]"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskPoster
                key={task.id}
                task={task}
                currentUserId={currentUserId}
              unreadCommentsCount={unreadCommentsByTask.get(task.id) || 0}
              isCreator={task.created_by === currentUserId}
              onOpen={onOpenTask}
              onToggleMine={onToggleMine}
              onDelete={onDeleteTask}
            />
          ))
          ) : (
            <div className="min-h-[220px] w-full rounded-[1.75rem] border border-dashed border-white/70 bg-white/70 p-6 text-center text-sm font-semibold text-slate-500">
              No hay tareas para mostrar con este filtro.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskPreviewDetailModal({
  task,
  onClose,
  highlightRelampago,
  relampagoRecipients,
  onRelampagoRecipientsChange,
  onToggleRelampagoRecipient,
  onRelampagoVisualChange,
}: {
  task: Todo;
  onClose: () => void;
  highlightRelampago?: boolean;
  relampagoRecipients: string[];
  onRelampagoRecipientsChange: (ids: string[]) => void;
  onToggleRelampagoRecipient: (uid: string) => void;
  onRelampagoVisualChange: (active: boolean) => void;
}) {
  const { currentUser } = useAuth();
  const { addComment, updateTodo, toggleTodo } = useTodos(currentUser);
  const { getSeenAt, markSeenAt } = useTaskCommentSeen(currentUser);
  const [newComment, setNewComment] = useState('');
  const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedRelampagoUserId = relampagoRecipients[0] || task.assigned_to.find((uid) => !task.completed_by.includes(uid)) || task.assigned_to[0] || '';
  const selectedRelampagoName = personName(selectedRelampagoUserId);
  const creator = personName(task.created_by);
  const isGloballyComplete = isGloballyDone(task);
  const isDoneForMe = task.completed_by.includes(currentUser.id);

  const toMillis = (value?: string | null) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const latestForeignComment = (task.comments || [])
    .filter((comment) => comment.user_id !== currentUser.id)
    .filter((comment) => !!comment.created_at)
    .sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at))[0];
  const seenAt = getSeenAt(task.id) || '';
  const seenAtMs = toMillis(seenAt);
  const unreadForeignComments = (task.comments || []).filter(
    (comment) => comment.user_id !== currentUser.id && toMillis(comment.created_at) > seenAtMs,
  ).length;

  const markCommentsRead = async () => {
    if (latestForeignComment?.created_at) {
      markSeenAt(task.id, latestForeignComment.created_at);
    }
    if (task.shocked_users?.includes(currentUser.id)) {
      const nextShocked = (task.shocked_users || []).filter((uid) => uid !== currentUser.id);
      await updateTodo({
        id: task.id,
        updates: {
          shocked_users: nextShocked,
        },
      });
    }
  };

  const handleToggleStatus = async () => {
    if (!task.assigned_to.includes(currentUser.id)) return;
    await toggleTodo(task);
  };

  const handleResolveByCompleting = async () => {
    if (!task.assigned_to.includes(currentUser.id)) return;
    if (!isDoneForMe) {
      await toggleTodo(task);
    }
  };

  const handleSendRelampago = async () => {
    const nextRecipients = relampagoRecipients.filter((uid) => task.assigned_to.includes(uid));
    if (nextRecipients.length === 0) {
      alert('Selecciona al menos una persona para enviar el relámpago.');
      return;
    }
    await updateTodo({
      id: task.id,
      updates: {
        shocked_users: Array.from(new Set(nextRecipients)),
      },
    });
    onRelampagoVisualChange(true);
  };

  const handleClearRelampago = async () => {
    await updateTodo({
      id: task.id,
      updates: {
        shocked_users: [],
      },
    });
    onRelampagoRecipientsChange([]);
    onRelampagoVisualChange(false);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && newAttachments.length === 0) return;

    setIsSubmitting(true);
    try {
      await addComment({
        todoId: task.id,
        text: newComment,
        attachments: newAttachments,
      });
      setNewComment('');
      setNewAttachments([]);
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Error al enviar el comentario');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/60 p-3 md:pl-64">
      <div className="custom-scrollbar max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-violet-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-500">Detalle moderno</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">{task.title}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Creada por {creator}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            <XCircle size={18} className="mr-1 inline" />
            Cerrar
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap gap-2">
                {task.due_date_key && (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 shadow-sm">
                    {formatDueDate(task.due_date_key)}
                  </span>
                )}
                {isGloballyComplete && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    Completada
                  </span>
                )}
                {(task.tags || []).filter((tag) => tag !== PRIORITY_TAG).map((tag) => (
                  <span key={tag} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-white bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Descripción</p>
                <LinkifiedText
                  as="div"
                  text={task.description || 'Sin descripción'}
                  className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700"
                  linkClassName="underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800"
                />
              </div>

              {task.attachments && task.attachments.length > 0 && (
                <div className="mt-4 rounded-[1.5rem] border border-white bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Paperclip size={15} className="text-slate-500" />
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Archivos adjuntos</p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {task.attachments.map((file: Attachment, idx: number) => (
                      <a
                        key={idx}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 hover:border-violet-200 hover:bg-violet-50"
                      >
                        <div className="rounded-xl bg-white p-2 text-violet-600 shadow-sm">
                          <Paperclip size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{file.name}</p>
                          <p className="text-xs text-slate-500">{file.type || 'Archivo adjunto'}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Comentarios</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Responde aquí, añade adjuntos o continúa la conversación.
                  </p>
                </div>
                {(unreadForeignComments > 0 || task.shocked_users?.includes(currentUser.id)) && (
                  <button
                    type="button"
                    onClick={markCommentsRead}
                    className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-black text-primary ring-1 ring-primary/20 hover:bg-primary/20"
                  >
                    Marcar leído
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-4">
                {task.comments && task.comments.length > 0 ? (
                  task.comments.map((comment: Comment) => {
                    const commentUser = USERS.find((u) => u.id === comment.user_id);
                    const isMe = comment.user_id === currentUser.id;
                    return (
                      <div key={comment.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <UserAvatar name={commentUser?.name || comment.user_id} size="sm" className="mt-1" />
                        <div className={`flex max-w-[80%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                              isMe ? 'rounded-tr-none bg-violet-600 text-white' : 'rounded-tl-none bg-slate-100 text-slate-800'
                            }`}
                          >
                            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.22em] opacity-70">
                              {commentUser?.name || comment.user_id}
                            </div>
                            <LinkifiedText
                              text={comment.text}
                              className="whitespace-pre-wrap leading-6"
                              linkClassName={
                                isMe
                                  ? 'underline decoration-dotted underline-offset-2 text-white hover:text-white/80'
                                  : 'underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800'
                              }
                            />

                            {comment.attachments && comment.attachments.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {comment.attachments.map((att, idx) => (
                                  <a
                                    key={idx}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                                      isMe ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <Paperclip size={12} />
                                    <span className="truncate max-w-[220px]">{att.name}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="mt-1 px-1 text-xs text-slate-400">
                            {new Date(comment.created_at).toLocaleString('es-ES')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    No hay comentarios aún. Puedes responderle aquí mismo.
                  </div>
                )}
              </div>

              <form onSubmit={handleAddComment} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.28em] text-slate-400">
                  Escribir respuesta
                </label>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Responde, aclara, pega un enlace o deja contexto..."
                  className="min-h-[110px] w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />

                <div className="mt-3">
                  <FileUploader
                    onUploadComplete={setNewAttachments}
                    existingFiles={newAttachments}
                    maxSizeMB={5}
                    compact
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting || (!newComment.trim() && newAttachments.length === 0)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span className="animate-pulse">Enviando...</span>
                    ) : (
                      <>
                        <Send size={15} />
                        Enviar respuesta
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`rounded-[1.75rem] border p-4 ${
              highlightRelampago ? 'border-red-300 bg-red-50 shadow-[0_0_0_4px_rgba(239,68,68,0.09)]' : 'border-violet-200 bg-violet-50'
            }`}>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-600">Relámpago para</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Puedes señalar una o varias personas. El aviso rojo se le quita solo a quien lo resuelva.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {task.assigned_to.map((uid) => {
                  const done = isDoneForUser(task, uid);
                  const selected = relampagoRecipients.includes(uid);
                  return (
                    <button
                      key={uid}
                      type="button"
                      onClick={() => onToggleRelampagoRecipient(uid)}
                      className={`rounded-full border px-3 py-2 text-sm font-bold transition ${
                        selected
                          ? 'border-red-300 bg-red-500 text-white shadow-[0_0_0_4px_rgba(239,68,68,0.12)]'
                          : done
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {personName(uid)}
                    </button>
                  );
                })}
              </div>
              <div className={`mt-4 rounded-2xl border p-4 ${
                highlightRelampago ? 'border-red-200 bg-red-100/70' : 'border-rose-200 bg-rose-50'
              }`}>
                <div className="flex items-center gap-2 text-rose-700">
                  <BellRing size={16} />
                  <p className="text-sm font-black">
                    {relampagoRecipients.length > 1
                      ? `Esta alerta iría a ${relampagoRecipients.map((uid) => personName(uid)).join(', ')}`
                      : `Esta alerta iría solo a ${selectedRelampagoName}`}
                  </p>
                </div>
                <p className="mt-2 text-sm font-medium text-rose-900/80">
                  En la maqueta, eliges una o varias personas aunque la tarea tenga varios asignados.
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Progreso</p>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                <span>
                  {task.completed_by.length}/{task.assigned_to.length} completadas
                </span>
                <span className={isGloballyComplete ? 'text-emerald-700' : 'text-slate-500'}>
                  {isGloballyComplete ? 'Hecha por todo el equipo' : 'Pendiente parcial'}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${isGloballyComplete ? 'bg-emerald-500' : 'bg-violet-500'}`}
                  style={{ width: `${task.assigned_to.length > 0 ? Math.round((task.completed_by.length / task.assigned_to.length) * 100) : 0}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2">
                {task.assigned_to.map((uid) => {
                  const done = isDoneForUser(task, uid);
                  return (
                    <div
                      key={uid}
                      className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm font-bold ${
                        done ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>{personName(uid)}</span>
                      <span>{done ? 'Hecha' : 'Pendiente'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Acciones</p>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={handleSendRelampago}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white hover:bg-red-400"
                >
                  <BellRing size={16} />
                  Enviar relámpago
                </button>
                <button
                  type="button"
                  onClick={handleClearRelampago}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 hover:bg-rose-100"
                >
                  Quitar relámpago
                </button>
                <button
                  type="button"
                  onClick={markCommentsRead}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-100"
                >
                  Marcar leído
                </button>
                <button
                  type="button"
                  onClick={handleResolveByCompleting}
                  disabled={!task.assigned_to.includes(currentUser.id)}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${
                    task.assigned_to.includes(currentUser.id)
                      ? 'border border-emerald-200 bg-emerald-500 text-white hover:bg-emerald-400'
                      : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isDoneForMe ? 'Mi parte terminada' : 'Marcar mi parte terminada'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleStatus}
                  disabled={!task.assigned_to.includes(currentUser.id)}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${
                    isDoneForMe
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border border-violet-200 bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  {isDoneForMe ? <CheckCircle2 size={16} /> : <Users size={16} />}
                  {isDoneForMe ? 'Mi parte: Terminada' : 'Mi parte: Pendiente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TasksModernPreviewPage() {
  const { currentUser } = useAuth();
  const { todos, toggleTodo, deleteTodo } = useTodos(currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Todo | null>(null);
  const [highlightRelampago, setHighlightRelampago] = useState(false);
  const [relampagoRecipients, setRelampagoRecipients] = useState<string[]>([]);
  const [openSections, setOpenSections] = useState({
    assigned: true,
    urgent: true,
    created: false,
    completed: false,
    team: false,
  });

  const unreadCommentsByTask = useMemo(() => {
    const map = new Map<number, number>();
    todos.forEach((task) => {
      const unread = (task.comments || []).filter((c: any) => c.user_id !== currentUser.id).length;
      map.set(task.id, unread);
    });
    return map;
  }, [todos, currentUser.id]);

  const isAdmin = !!currentUser?.isAdmin;
  const assignedToMe = useMemo(
    () => sortTasks(
      todos.filter((task) => task.assigned_to.includes(currentUser.id) && !isGloballyDone(task)),
      currentUser.id,
    ),
    [todos, currentUser.id],
  );
  const createdByMe = useMemo(
    () => sortTasks(
      todos.filter((task) => task.created_by === currentUser.id && !isGloballyDone(task)),
      currentUser.id,
    ),
    [todos, currentUser.id],
  );
  const urgent = useMemo(
    () => sortTasks(
      todos.filter((task) => isUrgent(task, currentUser.id) && !isGloballyDone(task)),
      currentUser.id,
    ),
    [todos, currentUser.id],
  );
  const completed = useMemo(
    () => sortTasks(todos.filter(isGloballyDone), currentUser.id),
    [todos, currentUser.id],
  );
  const allTeam = useMemo(
    () => sortTasks(todos.filter((task) => !isGloballyDone(task)), currentUser.id),
    [todos, currentUser.id],
  );
  const relampagoTasks = useMemo(
    () => sortTasks(
      todos.filter((task) => (task.shocked_users || []).includes(currentUser.id) && !isGloballyDone(task)),
      currentUser.id,
    ),
    [todos, currentUser.id],
  );

  const urgentCount = urgent.length;
  const assignedOpenCount = assignedToMe.filter((task) => !task.completed_by.includes(currentUser.id)).length;
  const createdCount = createdByMe.length;
  const relampagoSpotlightTask = relampagoTasks[0] || null;
  const spotlightTask = urgent[0] || assignedToMe[0] || createdByMe[0] || allTeam[0] || completed[0] || null;

  useEffect(() => {
    if (!selectedTask) return;
    const fresh = todos.find((task) => task.id === selectedTask.id);
    if (fresh && fresh !== selectedTask) {
      setSelectedTask(fresh);
    }
  }, [todos, selectedTask]);

  useEffect(() => {
    const taskParam = searchParams.get('task');
    if (!taskParam || todos.length === 0) return;
    const task = todos.find((item) => String(item.id) === taskParam);
    if (!task) return;
    setSelectedTask(task);
    setHighlightRelampago(!!task.shocked_users?.includes(currentUser.id));
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('task');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, todos, currentUser.id]);

  const openRelampago = (task: Todo) => {
    setHighlightRelampago(true);
    setSelectedTask(task);
  };

  useEffect(() => {
    if (!selectedTask) {
      setRelampagoRecipients([]);
      return;
    }

    const currentRelampago = (selectedTask.shocked_users || []).filter((uid) => selectedTask.assigned_to.includes(uid));
    if (currentRelampago.length > 0) {
      setRelampagoRecipients(currentRelampago);
      return;
    }

    const initialRecipient = selectedTask.assigned_to.find((uid) => !selectedTask.completed_by.includes(uid)) || selectedTask.assigned_to[0] || '';
    setRelampagoRecipients(initialRecipient ? [initialRecipient] : []);
  }, [selectedTask]);

  const toggleMyPart = async (task: Todo) => {
    try {
      if (task.assigned_to.includes(currentUser.id)) {
        await toggleTodo(task);
      }
    } catch (error) {
      console.error('Error toggling task in preview page:', error);
    }
  };

  const deleteTask = async (task: Todo) => {
    if (task.created_by !== currentUser.id) return;
    const ok = window.confirm(`¿Borrar la tarea "${task.title}"?`);
    if (!ok) return;
    await deleteTodo(task.id);
    setSelectedTask((current) => (current?.id === task.id ? null : current));
    setHighlightRelampago(false);
    setRelampagoRecipients([]);
  };

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRelampagoRecipient = (uid: string) => {
    setRelampagoRecipients((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="overflow-hidden rounded-[2rem] border border-violet-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_30%),linear-gradient(180deg,#ffffff_0%,#faf5ff_100%)] p-6 lg:grid-cols-[1.3fr_0.7fr] lg:p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black uppercase tracking-[0.3em] text-violet-700">
              <Sparkles size={13} />
              Propuesta moderna
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                Tareas como carrusel
              </h1>
              <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-slate-600">
                La idea es separar mejor lo que te toca a ti, lo que has creado y lo que necesita más urgencia, con tarjetas
                horizontales, nombres visibles y una alerta relámpago que se nota sin convertir todo en un muro infinito.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-black text-white shadow-sm">
                {assignedOpenCount} asignadas abiertas
              </span>
              <span className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white shadow-sm">
                {urgentCount} urgentes
              </span>
              <span className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-sm">
                {createdCount} creadas por ti
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-700"
              >
                <Plus size={15} />
                Nueva tarea
              </button>
              <button
                type="button"
                onClick={() => relampagoSpotlightTask && openRelampago(relampagoSpotlightTask)}
                disabled={!relampagoSpotlightTask}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 hover:bg-amber-100"
              >
                <BellRing size={15} />
                Ver relámpago mío
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.7)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-500/15 p-3 text-amber-300">
                <BellRing size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Lo urgente</p>
                <h2 className="text-2xl font-black">Relámpago visible</h2>
              </div>
            </div>
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-300">Quiere decir: léeme ya</span>
                <ArrowRight size={16} className="text-amber-300" />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Sin secuestrar toda la app. La tarea se queda arriba, visible, y solo se limpia cuando se reconoce o se resuelve.
              </p>
              <button
                type="button"
                onClick={() => spotlightTask && openRelampago(spotlightTask)}
                disabled={!spotlightTask}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-400"
              >
                Ver tarea destacada
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

        <TaskRail
        title="Asignadas a mí"
        subtitle="Más claras, con nombres visibles, fecha de creación y prioridad por lo más reciente."
        tasks={assignedToMe}
        currentUserId={currentUser.id}
        unreadCommentsByTask={unreadCommentsByTask}
        onOpenTask={setSelectedTask}
        onToggleMine={toggleMyPart}
        onDeleteTask={deleteTask}
        tone="violet"
        isOpen={openSections.assigned}
        onToggleOpen={() => toggleSection('assigned')}
      />

        <TaskRail
        title="Urgentes / relámpago"
        subtitle="Una fila que agrupa las tareas que ya están señaladas o vencidas."
        tasks={urgent}
        currentUserId={currentUser.id}
        unreadCommentsByTask={unreadCommentsByTask}
        onOpenTask={setSelectedTask}
        onToggleMine={toggleMyPart}
        onDeleteTask={deleteTask}
        tone="amber"
        isOpen={openSections.urgent}
        onToggleOpen={() => toggleSection('urgent')}
      />

        <TaskRail
        title="Creadas por mí"
        subtitle="Lo que tú generaste, ordenado por fecha de creación y con la urgencia visible."
        tasks={createdByMe}
        currentUserId={currentUser.id}
        unreadCommentsByTask={unreadCommentsByTask}
        onOpenTask={setSelectedTask}
        onToggleMine={toggleMyPart}
        onDeleteTask={deleteTask}
        tone="emerald"
        isOpen={openSections.created}
        onToggleOpen={() => toggleSection('created')}
      />

      {isAdmin && (
        <TaskRail
          title="Todo el equipo"
          subtitle="Vista administrativa, pero todavía en formato carrusel para no hacerse eterna."
          tasks={allTeam}
          currentUserId={currentUser.id}
          unreadCommentsByTask={unreadCommentsByTask}
          onOpenTask={setSelectedTask}
          onToggleMine={toggleMyPart}
          onDeleteTask={deleteTask}
          tone="sky"
          isOpen={openSections.team}
          onToggleOpen={() => toggleSection('team')}
        />
      )}

        <TaskRail
        title="Completas"
        subtitle="Todo lo que ya está terminado por todo el equipo, al final y plegado."
        tasks={completed}
        currentUserId={currentUser.id}
        unreadCommentsByTask={unreadCommentsByTask}
        onOpenTask={setSelectedTask}
        onToggleMine={toggleMyPart}
        onDeleteTask={deleteTask}
        tone="emerald"
        isOpen={openSections.completed}
        onToggleOpen={() => toggleSection('completed')}
      />

      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/80 p-4 text-sm font-semibold text-slate-600">
        Sugerencia visual: esta versión está pensada para que puedas pasar tareas hacia los lados, ver nombres completos,
        y reservar la alerta relámpago para lo realmente urgente.
      </div>

      {showCreateModal && <TodoModal onClose={() => setShowCreateModal(false)} />}
      {selectedTask && (
        <TaskPreviewDetailModal
          task={selectedTask}
          highlightRelampago={highlightRelampago}
          relampagoRecipients={relampagoRecipients}
          onRelampagoRecipientsChange={setRelampagoRecipients}
          onToggleRelampagoRecipient={toggleRelampagoRecipient}
          onRelampagoVisualChange={setHighlightRelampago}
          onClose={() => {
            setSelectedTask(null);
            setHighlightRelampago(false);
            setRelampagoRecipients([]);
          }}
        />
      )}
    </div>
  );
}
