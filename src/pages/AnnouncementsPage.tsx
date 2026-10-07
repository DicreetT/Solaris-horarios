import React, { useMemo, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, Plus, Trash2, Users } from 'lucide-react';
import { USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import {
  Announcement,
  AnnouncementAudience,
  AnnouncementPriority,
  isAnnouncementActiveOn,
  isAnnouncementVisibleForUser,
  useAnnouncements,
} from '../hooks/useAnnouncements';
import { toDateKey } from '../utils/dateUtils';

const AREA_OPTIONS = [
  { key: 'direccion', label: 'Dirección' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'operaciones', label: 'Operaciones' },
  { key: 'soporte', label: 'Soporte' },
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function priorityLabel(priority?: AnnouncementPriority) {
  if (priority === 'urgent') return 'Urgente';
  if (priority === 'important') return 'Importante';
  return 'Normal';
}

function priorityClass(priority?: AnnouncementPriority) {
  if (priority === 'urgent') return 'bg-red-50 text-red-700 border-red-200';
  if (priority === 'important') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function audienceLabel(announcement: Announcement) {
  if (announcement.audience === 'all') return 'Todo el equipo';
  if (announcement.audience === 'areas') {
    return (announcement.targetAreas || [])
      .map((area) => AREA_OPTIONS.find((option) => option.key === area)?.label || area)
      .join(', ') || 'Áreas sin definir';
  }
  return (announcement.targetUserIds || [])
    .map((userId) => USERS.find((user) => user.id === userId)?.name || 'Usuario')
    .join(', ') || 'Usuarios sin definir';
}

export default function AnnouncementsPage() {
  const { currentUser } = useAuth();
  const { announcements, isLoading, createAnnouncement, deleteAnnouncement, updateAnnouncement } = useAnnouncements(currentUser);
  const todayKey = toDateKey(new Date());

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [targetAreas, setTargetAreas] = useState<string[]>([]);

  const visibleAnnouncements = useMemo(() => (
    announcements.filter((announcement) => isAnnouncementVisibleForUser(announcement, currentUser))
  ), [announcements, currentUser]);

  const activeAnnouncements = visibleAnnouncements.filter((announcement) => isAnnouncementActiveOn(announcement, todayKey));
  const upcomingAnnouncements = visibleAnnouncements.filter((announcement) => announcement.startDate > todayKey);
  const pastAnnouncements = visibleAnnouncements.filter((announcement) => (announcement.endDate || announcement.startDate) < todayKey);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDate(todayKey);
    setEndDate('');
    setAudience('all');
    setPriority('normal');
    setTargetUserIds([]);
    setTargetAreas([]);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    createAnnouncement({
      title: cleanTitle,
      description: description.trim(),
      startDate,
      endDate: endDate || undefined,
      audience,
      targetUserIds: audience === 'users' ? targetUserIds : [],
      targetAreas: audience === 'areas' ? targetAreas : [],
      priority,
    });
    resetForm();
  };

  const toggleUser = (userId: string) => {
    setTargetUserIds((prev) => (
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    ));
  };

  const toggleArea = (areaKey: string) => {
    setTargetAreas((prev) => (
      prev.includes(areaKey) ? prev.filter((key) => key !== areaKey) : [...prev, areaKey]
    ));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-700">Comunicación interna</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">Avisos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Crea avisos fechados sin convertirlos en tareas. Aparecen aquí, en Mi espacio mientras estén activos y como referencia en el calendario.
            </p>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-black text-teal-800">
            {activeAnnouncements.length} activo(s) hoy
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-xl bg-teal-50 p-2 text-teal-700">
              <Plus size={18} />
            </span>
            <h2 className="text-lg font-black text-slate-950">Crear aviso</h2>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">Título</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                placeholder="Ej. Llegada de mercancía"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">Descripción</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="mt-1 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                placeholder="Qué necesita saber el equipo..."
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Inicio</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Fin opcional</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Destinatarios</span>
                <select
                  value={audience}
                  onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="all">Todo el equipo</option>
                  <option value="users">Usuarios concretos</option>
                  <option value="areas">Áreas</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Prioridad</span>
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as AnnouncementPriority)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="normal">Normal</option>
                  <option value="important">Importante</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
            </div>

            {audience === 'users' && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Usuarios</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {USERS.filter((user) => !user.isRestricted).map((user) => (
                    <label key={user.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">
                      <input type="checkbox" checked={targetUserIds.includes(user.id)} onChange={() => toggleUser(user.id)} />
                      {user.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {audience === 'areas' && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Áreas</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AREA_OPTIONS.map((area) => (
                    <label key={area.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">
                      <input type="checkbox" checked={targetAreas.includes(area.key)} onChange={() => toggleArea(area.key)} />
                      {area.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
              disabled={!title.trim() || isLoading}
            >
              <Bell size={17} />
              Crear aviso
            </button>
          </div>
        </form>

        <div className="space-y-5">
          <AnnouncementGroup title="Activos hoy" icon={Bell} announcements={activeAnnouncements} empty="No hay avisos activos para hoy." onDelete={deleteAnnouncement} onFinish={(id) => updateAnnouncement(id, { endDate: todayKey })} />
          <AnnouncementGroup title="Próximos" icon={CalendarDays} announcements={upcomingAnnouncements} empty="No hay avisos programados." onDelete={deleteAnnouncement} />
          <AnnouncementGroup title="Histórico" icon={CheckCircle2} announcements={pastAnnouncements.slice(0, 8)} empty="Todavía no hay avisos finalizados." onDelete={deleteAnnouncement} />
        </div>
      </section>
    </div>
  );
}

function AnnouncementGroup({
  title,
  icon: Icon,
  announcements,
  empty,
  onDelete,
  onFinish,
}: {
  title: string;
  icon: React.ElementType;
  announcements: Announcement[];
  empty: string;
  onDelete: (id: string) => void;
  onFinish?: (id: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <Icon size={18} />
          </span>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{announcements.length}</span>
      </div>

      {announcements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <article key={announcement.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-slate-950">{announcement.title}</h3>
                    <span className={classNames('rounded-full border px-2 py-1 text-[11px] font-black', priorityClass(announcement.priority))}>
                      {priorityLabel(announcement.priority)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{announcement.description || 'Sin descripción.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {onFinish && (
                    <button
                      type="button"
                      onClick={() => onFinish(announcement.id)}
                      className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                    >
                      Finalizar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(announcement.id)}
                    className="rounded-xl border border-red-100 bg-white p-2 text-red-500 hover:bg-red-50"
                    aria-label="Eliminar aviso"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-500">
                <span className="rounded-full bg-white px-3 py-1">
                  {announcement.startDate}{announcement.endDate ? ` → ${announcement.endDate}` : ''}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1">
                  <Users size={13} />
                  {audienceLabel(announcement)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
