import React, { useMemo, useState } from 'react';
import { Activity, ChefHat, ClipboardCheck, HeartPulse, UploadCloud, Wind, Dumbbell } from 'lucide-react';

type SectionKey = 'menu' | 'exercise' | 'analytics';

type Exercise = {
  id: string;
  name: string;
  duration: string;
  reps: string;
  objective: string;
  steps: string[];
};

const EXERCISES: Exercise[] = [
  {
    id: 'walk',
    name: 'Caminata ligera en casa',
    duration: '10-15 min',
    reps: '1-2 veces al día',
    objective: 'Mejorar circulación y control de glucosa/lípidos.',
    steps: [
      'Camina por pasillo o sala a ritmo cómodo.',
      'Mantén hombros relajados y respiración nasal.',
      'Si te falta el aire, baja ritmo y continúa suave.',
    ],
  },
  {
    id: 'arms',
    name: 'Elevación de brazos + respiración',
    duration: '4 min',
    reps: '2 bloques',
    objective: 'Movilidad torácica y retorno venoso.',
    steps: [
      'Inhala elevando brazos por delante.',
      'Exhala bajando lento y controlado.',
      'Repite 12 veces, descansa 30 segundos.',
    ],
  },
  {
    id: 'chair',
    name: 'Sentarse y levantarse de silla',
    duration: '5 min',
    reps: '3 x 8 repeticiones',
    objective: 'Fortalecer piernas y activar metabolismo.',
    steps: [
      'Usa una silla estable, pies al ancho de cadera.',
      'Levántate sin impulso brusco.',
      'Si hace falta, apóyate con manos suavemente.',
    ],
  },
  {
    id: 'ankle',
    name: 'Bombeo de tobillos',
    duration: '3 min',
    reps: '2 x 20 movimientos',
    objective: 'Mejorar retorno venoso en piernas.',
    steps: [
      'Sentado, eleva puntas de pies y luego talones.',
      'Haz movimiento fluido y sin dolor.',
      'Descansa 20 segundos y repite.',
    ],
  },
  {
    id: 'breath',
    name: 'Respiración diafragmática',
    duration: '5 min',
    reps: '1-2 veces al día',
    objective: 'Bajar estrés y apoyar salud cardiovascular.',
    steps: [
      'Una mano en pecho, otra en abdomen.',
      'Inhala por nariz 4 segundos, exhala 6 segundos.',
      'Mantén ritmo suave durante 5 minutos.',
    ],
  },
];

const FOOD_RECOMMENDATIONS = [
  'Avena integral + frutos rojos + nueces (fibra soluble).',
  'Pescado azul 2 veces/semana (omega-3).',
  'Legumbres 3-4 veces/semana.',
  'Aceite de oliva virgen extra como grasa principal.',
  'Verduras de hoja verde en comida y cena.',
  'Reducir ultraprocesados, bollería y alcohol frecuente.',
];

function AvatarDoctorCard() {
  return (
    <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 rounded-full bg-violet-200/70 ring-4 ring-white">
          <div className="absolute inset-2 rounded-full bg-amber-100" />
          <div className="absolute left-2 right-2 top-1 h-7 rounded-t-full bg-amber-700/80" />
          <div className="absolute bottom-1 left-1 right-1 h-8 rounded-xl bg-white" />
          <div className="absolute left-5 top-10 h-1.5 w-1.5 rounded-full bg-slate-800" />
          <div className="absolute right-5 top-10 h-1.5 w-1.5 rounded-full bg-slate-800" />
          <div className="absolute left-4 right-4 top-9 h-2 rounded-full border border-slate-500/60" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">Acompañamiento de salud</p>
          <h1 className="text-2xl font-black text-violet-950">Hi, I&apos;m Doctor Vila</h1>
          <p className="mt-1 text-sm text-slate-600">
            Plan simple para hábitos diarios de apoyo cardiovascular.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VilaHealthPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('menu');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [weeklyLog, setWeeklyLog] = useState({
    week: '',
    mood: '',
    energy: '',
    exerciseDone: '',
    notes: '',
  });
  const [files, setFiles] = useState<File[]>([]);

  const statusLine = useMemo(() => {
    const today = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    return `Buenos días. Hoy es ${today}. No hay nuevas recomendaciones médicas pendientes.`;
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <AvatarDoctorCard />

      <div className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-700">{statusLine}</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => setActiveSection('menu')}
            className={`rounded-2xl border p-4 text-left transition ${
              activeSection === 'menu' ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 bg-violet-50 text-violet-900'
            }`}
          >
            <ChefHat className="mb-2" size={20} />
            <p className="font-black">Platos recomendados</p>
            <p className="text-xs opacity-90">Guía semanal para colesterol.</p>
          </button>
          <button
            onClick={() => setActiveSection('exercise')}
            className={`rounded-2xl border p-4 text-left transition ${
              activeSection === 'exercise' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <Dumbbell className="mb-2" size={20} />
            <p className="font-black">Ejercicios caseros</p>
            <p className="text-xs opacity-90">Movilidad, respiración y circulación.</p>
          </button>
          <button
            onClick={() => setActiveSection('analytics')}
            className={`rounded-2xl border p-4 text-left transition ${
              activeSection === 'analytics' ? 'border-sky-600 bg-sky-600 text-white' : 'border-sky-200 bg-sky-50 text-sky-900'
            }`}
          >
            <ClipboardCheck className="mb-2" size={20} />
            <p className="font-black">Analíticas y seguimiento</p>
            <p className="text-xs opacity-90">Subir archivos y registrar semana.</p>
          </button>
        </div>
      </div>

      {activeSection === 'menu' && (
        <div className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-violet-800">
            <HeartPulse size={18} />
            <h2 className="text-lg font-black">Recomendaciones culinarias</h2>
          </div>
          <ul className="mt-3 space-y-2">
            {FOOD_RECOMMENDATIONS.map((item) => (
              <li key={item} className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-sm text-slate-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeSection === 'exercise' && (
        <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-800">
            <Activity size={18} />
            <h2 className="text-lg font-black">Ejercicios para movilización vascular</h2>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {EXERCISES.map((exercise) => (
              <button
                key={exercise.id}
                onClick={() => setSelectedExercise(exercise)}
                className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-left hover:bg-emerald-100 transition"
              >
                <p className="font-bold text-emerald-900">{exercise.name}</p>
                <p className="text-xs text-emerald-700 mt-1">{exercise.duration} · {exercise.reps}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'analytics' && (
        <div className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sky-800">
            <UploadCloud size={18} />
            <h2 className="text-lg font-black">Analíticas y comentarios médicos</h2>
          </div>

          <label className="block rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 p-4 cursor-pointer hover:bg-sky-100 transition">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files || []);
                if (list.length === 0) return;
                setFiles((prev) => [...prev, ...list]);
              }}
            />
            <p className="text-sm font-semibold text-sky-900">Subir analíticas / informes</p>
            <p className="text-xs text-sky-700 mt-1">PDF, imagen o documento médico.</p>
          </label>

          {files.length > 0 && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-700 mb-2">Archivos cargados</p>
              <ul className="space-y-1">
                {files.map((file, idx) => (
                  <li key={`${file.name}-${idx}`} className="text-sm text-slate-700">{file.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={weeklyLog.week}
              onChange={(e) => setWeeklyLog((p) => ({ ...p, week: e.target.value }))}
              placeholder="Semana (ej. 2026-W08)"
              className="rounded-xl border border-sky-200 px-3 py-2 text-sm"
            />
            <input
              value={weeklyLog.mood}
              onChange={(e) => setWeeklyLog((p) => ({ ...p, mood: e.target.value }))}
              placeholder="¿Cómo te sentiste?"
              className="rounded-xl border border-sky-200 px-3 py-2 text-sm"
            />
            <input
              value={weeklyLog.energy}
              onChange={(e) => setWeeklyLog((p) => ({ ...p, energy: e.target.value }))}
              placeholder="Energía (1-10)"
              className="rounded-xl border border-sky-200 px-3 py-2 text-sm"
            />
            <input
              value={weeklyLog.exerciseDone}
              onChange={(e) => setWeeklyLog((p) => ({ ...p, exerciseDone: e.target.value }))}
              placeholder="Ejercicio realizado (sí/no/parcial)"
              className="rounded-xl border border-sky-200 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={weeklyLog.notes}
            onChange={(e) => setWeeklyLog((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Notas semanales (alimentación, tensión, observaciones)"
            className="w-full min-h-[100px] rounded-xl border border-sky-200 px-3 py-2 text-sm"
          />
          <button className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 transition">
            <Wind size={16} />
            Guardar seguimiento semanal
          </button>
        </div>
      )}

      {selectedExercise && (
        <div className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px] p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-3xl border border-emerald-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Ejercicio</p>
                <h3 className="text-xl font-black text-emerald-950">{selectedExercise.name}</h3>
              </div>
              <button
                onClick={() => setSelectedExercise(null)}
                className="rounded-lg border border-emerald-200 px-3 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Cerrar
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-700"><strong>Objetivo:</strong> {selectedExercise.objective}</p>
            <p className="mt-1 text-sm text-slate-700"><strong>Duración:</strong> {selectedExercise.duration}</p>
            <p className="mt-1 text-sm text-slate-700"><strong>Repeticiones:</strong> {selectedExercise.reps}</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-700 list-disc pl-5">
              {selectedExercise.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

