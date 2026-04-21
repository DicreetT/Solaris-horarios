import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Flame,
  Sparkles,
  User,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USERS } from '../constants';

type PreviewStep = 'created' | 'alerted' | 'acknowledged' | 'done';

function nameOf(id: string) {
  return USERS.find((u) => u.id === id)?.name || id;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'violet' | 'amber' | 'emerald' | 'slate';
}) {
  const toneClasses = {
    violet: 'bg-violet-100 text-violet-700 border-violet-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${toneClasses[tone]}`}>{children}</span>;
}

function PersonChip({
  name,
  active,
  done,
  onClick,
}: {
  name: string;
  active?: boolean;
  done?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold transition ${
        done
          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
          : active
            ? 'border-amber-300 bg-amber-500 text-slate-950 shadow-sm'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <User size={14} />
      {name}
    </button>
  );
}

function TaskCard({
  title,
  subtitle,
  step,
  selectedRecipient,
  assignees,
  unreadCount = 0,
}: {
  title: string;
  subtitle: string;
  step: PreviewStep;
  selectedRecipient: string;
  assignees: string[];
  unreadCount?: number;
}) {
  const urgent = step === 'alerted' || step === 'acknowledged';
  const done = step === 'done';
  const theme = done
    ? 'border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-teal-50'
    : urgent
      ? 'border-amber-200 bg-gradient-to-br from-white via-amber-50 to-orange-50'
      : 'border-violet-200 bg-gradient-to-br from-white via-violet-50 to-fuchsia-50';

  return (
    <article className={`rounded-[2rem] border p-4 shadow-sm transition ${theme}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Tarea de ejemplo</p>
          <h3 className="mt-1 text-xl font-black leading-tight text-slate-950">{title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p>
        </div>
        <div className={`rounded-2xl p-2 ${done ? 'bg-emerald-100 text-emerald-600' : urgent ? 'bg-amber-500/15 text-amber-600' : 'bg-violet-100 text-violet-700'}`}>
          {done ? <CheckCircle2 size={18} /> : urgent ? <BellRing size={18} className="animate-pulse" /> : <Sparkles size={18} />}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {done ? (
          <Badge tone="emerald">
            <CheckCircle2 size={12} />
            Completada
          </Badge>
        ) : urgent ? (
          <Badge tone="amber">
            <Flame size={12} />
            Alerta relámpago
          </Badge>
        ) : (
          <Badge tone="violet">
            <Sparkles size={12} />
            Normal
          </Badge>
        )}
        {unreadCount > 0 && (
          <Badge tone="slate">
            <BellRing size={12} />
            {unreadCount} aviso{unreadCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="mt-4 rounded-[1.5rem] border border-white/80 bg-white/75 p-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
          <span>Relámpago para</span>
          <span className="text-slate-900">{selectedRecipient || 'Nadie'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {assignees.map((assignee) => {
            const isSelected = assignee === selectedRecipient;
            return (
              <span
                key={assignee}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  isSelected
                    ? 'border-amber-300 bg-amber-500 text-slate-950'
                    : done
                      ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-700'
                }`}
              >
                {assignee}
              </span>
            );
          })}
        </div>
      </div>
    </article>
  );
}

export default function LightningAlertPreviewPage() {
  const { currentUser } = useAuth();
  const [step, setStep] = useState<PreviewStep>('created');
  const assignees = useMemo(
    () => [nameOf(currentUser?.id || ''), nameOf('itzi'), nameOf('esteban')].filter(Boolean),
    [currentUser?.id],
  );
  const [selectedRecipient, setSelectedRecipient] = useState(assignees[0] || '');

  const isAlerted = step === 'alerted' || step === 'acknowledged';
  const isDone = step === 'done';

  return (
    <div className="min-h-[calc(100vh-2rem)] rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.12),_transparent_38%),linear-gradient(180deg,_#fbfbff_0%,_#f8fafc_52%,_#eef2ff_100%)] p-5 shadow-sm">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-violet-200 bg-white shadow-xl">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black uppercase tracking-[0.28em] text-violet-700">
                <Sparkles size={13} />
                Demo interactiva
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                  Cómo se vería la alerta relámpago
                </h1>
                <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-slate-600">
                  Esta versión simula una tarea real asignada a varias personas, con un destinatario de relámpago elegido a mano
                  y una transición clara entre creada, avisada, reconocida y resuelta.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone="violet">
                  <Users size={12} />
                  Asignada a varios
                </Badge>
                <Badge tone="amber">
                  <BellRing size={12} />
                  Una sola persona recibe el relámpago
                </Badge>
                <Badge tone="emerald">
                  <CheckCircle2 size={12} />
                  Al resolverla, se limpia
                </Badge>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.8)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-500/15 p-3 text-amber-300">
                  <Zap size={24} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Estados</p>
                  <h2 className="text-2xl font-black">Secuencia visual</h2>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={() => setStep('created')}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${
                    step === 'created' ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  1. Creada
                </button>
                <button
                  type="button"
                  onClick={() => setStep('alerted')}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${
                    step === 'alerted' ? 'bg-amber-500 text-slate-950' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  2. Alertada
                </button>
                <button
                  type="button"
                  onClick={() => setStep('acknowledged')}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${
                    step === 'acknowledged' ? 'bg-amber-500 text-slate-950' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  3. Reconocida
                </button>
                <button
                  type="button"
                  onClick={() => setStep('done')}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${
                    step === 'done' ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  4. Resuelta
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-[2rem] border border-violet-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-600">Vista 1</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">Quien crea la tarea</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              Ve la tarea, quién recibirá el relámpago y puede cambiar el destino al vuelo.
            </p>
            <div className="mt-4">
              <TaskCard
                title="Cartonaje para pedido urgente"
                subtitle="Hay que revisarlo hoy"
                step={step}
                selectedRecipient={selectedRecipient}
                assignees={assignees}
                unreadCount={1}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="violet">
                <User size={12} />
                {currentUser?.name || 'Tú'}
              </Badge>
              <Badge tone="slate">Creó la tarea</Badge>
            </div>
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Vista 2</p>
            <h3 className="mt-1 text-2xl font-black">Quien la recibe</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-300">
              Aquí se siente el impacto: el banner, el acuse y la sensación de “esto me toca”.
            </p>
            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <BellRing size={16} className={isAlerted ? 'text-amber-300 animate-pulse' : 'text-slate-500'} />
                <span className="text-sm font-black text-amber-300">
                  {isAlerted ? `Relámpago activo para ${selectedRecipient}` : 'Todavía no hay relámpago activo'}
                </span>
              </div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <p className="text-sm leading-6 text-slate-200">
                  “Necesito esto ya. Léelo, confírmalo y, si puedes, lo sacas hoy.”
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep('alerted')}
                  className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-400"
                >
                  Activar relámpago
                </button>
                <button
                  type="button"
                  onClick={() => setStep('acknowledged')}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black text-white hover:bg-white/10"
                >
                  Entendido
                </button>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Cambiar destinatario</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {assignees.map((assignee) => (
                    <PersonChip
                      key={assignee}
                      name={assignee}
                      active={selectedRecipient === assignee && isAlerted && !isDone}
                      done={step === 'done'}
                      onClick={() => setSelectedRecipient(assignee)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700">Vista 3</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">Cuando se resuelve</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
              Al marcarla como vista o hecha, la alerta se retira y la tarjeta vuelve a un estado normal.
            </p>
            <div className="mt-4">
              <TaskCard
                title="Cartonaje para pedido urgente"
                subtitle="La tarea ya pasó al final"
                step={isDone ? 'done' : step}
                selectedRecipient={selectedRecipient}
                assignees={assignees}
                unreadCount={0}
              />
            </div>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => setStep('done')}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500"
              >
                Marcar como resuelta
              </button>
              <button
                type="button"
                onClick={() => setStep('created')}
                className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-50"
              >
                Reiniciar demo
              </button>
            </div>
            <div className="mt-4 rounded-[1.5rem] border border-dashed border-emerald-200 bg-white/80 p-4 text-sm font-semibold text-emerald-800">
              La versión real podría mostrar este estado en una franja fija dentro de Lunaris, sin bloquear toda la app.
            </div>
          </article>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Resumen</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950">Cómo se leería en Lunaris</h3>
            </div>
            <Badge tone="slate">
              <ChevronRight size={12} />
              Secciones plegables
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-sm font-black text-violet-700">Asignadas a mí</p>
              <p className="mt-1 text-sm text-violet-900">Arriba del todo, con carrusel horizontal y nombres completos.</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-700">Relámpago</p>
              <p className="mt-1 text-sm text-amber-900">La urgencia no bloquea todo Lunaris, pero sí llama la atención.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-black text-emerald-700">Completas</p>
              <p className="mt-1 text-sm text-emerald-900">Bajan al final y se colapsan para no ensuciar la vista.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
