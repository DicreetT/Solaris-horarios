import { useMemo } from 'react';
import type { User } from '../types';
import { useNotifications } from './useNotifications';
import { useSharedJsonState } from './useSharedJsonState';

export const MENTIONS_KEY = 'mentions_v1';

export type MentionType = 'informar' | 'consultar' | 'participar' | 'validar' | 'decidir';
export type MentionStatus = 'pending' | 'informed' | 'approved' | 'waiting' | 'rejected' | 'observed';
export type MentionOriginType = 'project' | 'project_step' | 'task' | 'note' | 'announcement' | 'formation' | 'inventory_event' | 'other';
export type MentionResponseKind = 'approved' | 'waiting' | 'rejected' | 'observed' | 'informed';

export type MentionResponse = {
  id: string;
  userId: string;
  kind: MentionResponseKind;
  comment: string;
  createdAt: string;
};

export type Mention = {
  id: string;
  title: string;
  originType: MentionOriginType;
  originId: string;
  originLabel?: string;
  objectPath?: string;
  sourceUserId: string;
  targetUserId: string;
  mentionType: MentionType;
  context: string;
  status: MentionStatus;
  responses: MentionResponse[];
  createdAt: string;
  updatedAt: string;
};

export type MentionDraft = {
  title: string;
  originType: MentionOriginType;
  originId: string;
  originLabel?: string;
  objectPath?: string;
  targetUserId: string;
  mentionType: MentionType;
  context: string;
};

function uniqueId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusFromResponse(kind: MentionResponseKind): MentionStatus {
  if (kind === 'approved') return 'approved';
  if (kind === 'waiting') return 'waiting';
  if (kind === 'rejected') return 'rejected';
  if (kind === 'observed') return 'observed';
  return 'informed';
}

function timestampMs(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function mergeMentionLists(remote: unknown, local: unknown): Mention[] {
  const remoteList = Array.isArray(remote) ? remote as Mention[] : [];
  const localList = Array.isArray(local) ? local as Mention[] : [];
  const byId = new Map<string, Mention>();

  [...remoteList, ...localList].forEach((mention) => {
    const id = String(mention?.id || '').trim();
    if (!id) return;
    const previous = byId.get(id);
    const mentionTime = timestampMs(mention.updatedAt || mention.createdAt);
    const previousTime = timestampMs(previous?.updatedAt || previous?.createdAt);
    byId.set(id, !previous || mentionTime >= previousTime ? { ...previous, ...mention } : { ...mention, ...previous });
  });

  return Array.from(byId.values()).sort((a, b) => (
    timestampMs(b.createdAt || b.updatedAt) - timestampMs(a.createdAt || a.updatedAt)
  ));
}

export function mentionTypeLabel(type: MentionType) {
  if (type === 'informar') return 'Informar';
  if (type === 'consultar') return 'Consultar';
  if (type === 'participar') return 'Participar';
  if (type === 'validar') return 'Validar';
  return 'Decidir';
}

export function mentionStatusLabel(status: MentionStatus) {
  if (status === 'approved') return 'Aprobado';
  if (status === 'waiting') return 'En espera';
  if (status === 'rejected') return 'No aprobado';
  if (status === 'observed') return 'Observación';
  if (status === 'informed') return 'Informado';
  return 'Pendiente';
}

export function mentionNeedsResponse(mention: Mention) {
  return ['consultar', 'validar', 'decidir'].includes(mention.mentionType);
}

export function useMentions(currentUser?: User | null) {
  const { addNotification } = useNotifications(currentUser || null);
  const [mentionsState, setMentions, isLoading] = useSharedJsonState<Mention[]>(
    MENTIONS_KEY,
    [],
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      mergeStrategy: mergeMentionLists,
      isUsefulPayload: (payload) => Array.isArray(payload),
    },
  );

  const mentions = useMemo(() => {
    const list = Array.isArray(mentionsState) ? mentionsState : [];
    return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [mentionsState]);

  const mentionsForMe = useMemo(() => (
    mentions.filter((mention) => mention.targetUserId === currentUser?.id)
  ), [currentUser?.id, mentions]);

  const mentionsByMe = useMemo(() => (
    mentions.filter((mention) => mention.sourceUserId === currentUser?.id)
  ), [currentUser?.id, mentions]);

  const pendingForMe = useMemo(() => (
    mentionsForMe.filter((mention) => mention.status === 'pending')
  ), [mentionsForMe]);

  const createMention = async (draft: MentionDraft) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const now = new Date().toISOString();
    const mention: Mention = {
      ...draft,
      id: uniqueId('mention'),
      sourceUserId: currentUser.id,
      status: draft.mentionType === 'informar' ? 'informed' : 'pending',
      responses: [],
      createdAt: now,
      updatedAt: now,
    };

    setMentions((prev) => [mention, ...(Array.isArray(prev) ? prev : [])]);

    if (draft.targetUserId && draft.targetUserId !== currentUser.id) {
      await addNotification({
        userId: draft.targetUserId,
        type: draft.mentionType === 'informar' ? 'info' : 'action_required',
        message: `Nueva mención (${mentionTypeLabel(draft.mentionType)}): ${draft.title}`,
      });
    }

    return mention;
  };

  const respondToMention = async (mentionId: string, kind: MentionResponseKind, comment: string) => {
    if (!currentUser?.id) throw new Error('No hay usuario activo.');
    const now = new Date().toISOString();
    let sourceUserId: string | undefined;
    let title = 'mención';

    setMentions((prev) => (
      (Array.isArray(prev) ? prev : []).map((mention) => {
        if (mention.id !== mentionId) return mention;
        sourceUserId = mention.sourceUserId;
        title = mention.title;
        const response: MentionResponse = {
          id: uniqueId('mention-response'),
          userId: currentUser.id,
          kind,
          comment,
          createdAt: now,
        };
        return {
          ...mention,
          status: statusFromResponse(kind),
          responses: [...(mention.responses || []), response],
          updatedAt: now,
        };
      })
    ));

    if (sourceUserId && sourceUserId !== currentUser.id) {
      await addNotification({
        userId: sourceUserId,
        type: 'info',
        message: `${currentUser.name} respondió una mención: ${title}`,
      });
    }
  };

  return {
    mentions,
    mentionsForMe,
    mentionsByMe,
    pendingForMe,
    isLoading,
    createMention,
    respondToMention,
  };
}
