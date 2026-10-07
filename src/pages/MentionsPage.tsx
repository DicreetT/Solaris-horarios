import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, CheckCircle2, Clock3, Eye, MessageSquare, ShieldCheck, XCircle } from 'lucide-react';
import { USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import {
  Mention,
  MentionResponseKind,
  mentionNeedsResponse,
  mentionStatusLabel,
  mentionTypeLabel,
  useMentions,
} from '../hooks/useMentions';

function userName(id: string) {
  return USERS.find((user) => user.id === id)?.name || 'Usuario';
}

function statusClass(status: Mention['status']) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'waiting') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'observed') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'informed') return 'bg-slate-50 text-slate-700 border-slate-200';
  return 'bg-violet-50 text-violet-700 border-violet-200';
}

function typeIcon(type: Mention['mentionType']) {
  if (type === 'informar') return Eye;
  if (type === 'consultar') return MessageSquare;
  if (type === 'participar') return AtSign;
  if (type === 'validar') return ShieldCheck;
  return CheckCircle2;
}

export default function MentionsPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { mentionsForMe, mentionsByMe, pendingForMe, respondToMention } = useMentions(currentUser);
  const [activeTab, setActiveTab] = useState<'mine' | 'sent'>('mine');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});

  const visibleMentions = activeTab === 'mine' ? mentionsForMe : mentionsByMe;
  const decisions = useMemo(() => (
    mentionsForMe.filter((mention) => ['decidir', 'validar'].includes(mention.mentionType) && mention.status === 'pending')
  ), [mentionsForMe]);

  const answer = async (mention: Mention, kind: MentionResponseKind) => {
    await respondToMention(mention.id, kind, responseDrafts[mention.id] || '');
    setResponseDrafts((prev) => ({ ...prev, [mention.id]: '' }));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-700">Conexiones entre áreas</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">Menciones para mí</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Una mención te da acceso al contexto concreto donde te llamaron, no al espacio completo de otra persona.
            </p>
          </div>
          <div className="grid gap-2 text-right">
            <span className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-2 text-sm font-black text-violet-800">
              {pendingForMe.length} pendiente(s)
            </span>
            <span className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800">
              {decisions.length} decisión/validación
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('mine')}
          className={`rounded-2xl px-4 py-2 text-sm font-black ${activeTab === 'mine' ? 'bg-violet-700 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          Para mí
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sent')}
          className={`rounded-2xl px-4 py-2 text-sm font-black ${activeTab === 'sent' ? 'bg-violet-700 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          Enviadas por mí
        </button>
      </div>

      {visibleMentions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
          No hay menciones en esta vista.
        </div>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {visibleMentions.map((mention) => {
            const Icon = typeIcon(mention.mentionType);
            const latestResponse = mention.responses?.[mention.responses.length - 1];
            return (
              <article key={mention.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-xl bg-violet-50 p-2 text-violet-700">
                        <Icon size={18} />
                      </span>
                      <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                        {mentionTypeLabel(mention.mentionType)}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(mention.status)}`}>
                        {mentionStatusLabel(mention.status)}
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-slate-950">{mention.title}</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {activeTab === 'mine' ? `De ${userName(mention.sourceUserId)}` : `Para ${userName(mention.targetUserId)}`} · {mention.originLabel || mention.originType}
                    </p>
                  </div>
                  {mention.objectPath && (
                    <button
                      type="button"
                      onClick={() => navigate(mention.objectPath || '/mentions')}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-white"
                    >
                      Abrir contexto
                    </button>
                  )}
                </div>

                <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
                  {mention.context || 'Sin contexto.'}
                </div>

                {latestResponse && (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                    Última respuesta de {userName(latestResponse.userId)}: {latestResponse.comment || mentionStatusLabel(mention.status)}
                  </div>
                )}

                {activeTab === 'mine' && mentionNeedsResponse(mention) && mention.status === 'pending' && (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={responseDrafts[mention.id] || ''}
                      onChange={(event) => setResponseDrafts((prev) => ({ ...prev, [mention.id]: event.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                      placeholder="Observación opcional..."
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => answer(mention, 'approved')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
                        <CheckCircle2 size={14} />
                        Aprobar
                      </button>
                      <button type="button" onClick={() => answer(mention, 'waiting')} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">
                        <Clock3 size={14} />
                        En espera
                      </button>
                      <button type="button" onClick={() => answer(mention, 'rejected')} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white">
                        <XCircle size={14} />
                        No aprobar
                      </button>
                      <button type="button" onClick={() => answer(mention, 'observed')} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                        <MessageSquare size={14} />
                        Observación
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
