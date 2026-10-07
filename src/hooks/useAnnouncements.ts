import { useMemo } from 'react';
import type { User } from '../types';
import { useSharedJsonState } from './useSharedJsonState';

export const ANNOUNCEMENTS_KEY = 'announcements_v1';

export type AnnouncementAudience = 'all' | 'users' | 'areas';
export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

export type Announcement = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate?: string;
  audience: AnnouncementAudience;
  targetUserIds?: string[];
  targetAreas?: string[];
  priority?: AnnouncementPriority;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

const AREA_BY_USER_NAME: Record<string, string> = {
  thalia: 'direccion',
  itzi: 'ventas',
  anabella: 'inventario',
  heidy: 'finanzas',
  esteban: 'operaciones',
  fer: 'soporte',
};

function uniqueId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `announcement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function userAreaKey(user?: User | null) {
  const name = (user?.name || '').trim().toLowerCase();
  return AREA_BY_USER_NAME[name] || name || 'general';
}

export function isAnnouncementActiveOn(announcement: Announcement, dateKey: string) {
  const start = announcement.startDate;
  const end = announcement.endDate || announcement.startDate;
  return start <= dateKey && end >= dateKey;
}

export function isAnnouncementVisibleForUser(announcement: Announcement, user?: User | null) {
  if (!user) return false;
  if (announcement.audience === 'all') return true;
  if (announcement.audience === 'users') {
    return announcement.targetUserIds?.includes(user.id) || false;
  }
  if (announcement.audience === 'areas') {
    return announcement.targetAreas?.includes(userAreaKey(user)) || false;
  }
  return false;
}

export function useAnnouncements(currentUser?: User | null) {
  const [announcementsState, setAnnouncements, isLoading] = useSharedJsonState<Announcement[]>(
    ANNOUNCEMENTS_KEY,
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

  const announcements = useMemo(() => {
    const list = Array.isArray(announcementsState) ? announcementsState : [];
    return [...list].sort((a, b) => {
      const dateDiff = (b.startDate || '').localeCompare(a.startDate || '');
      if (dateDiff !== 0) return dateDiff;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [announcementsState]);

  const createAnnouncement = (draft: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    const now = new Date().toISOString();
    const announcement: Announcement = {
      ...draft,
      id: uniqueId(),
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser?.id,
    };
    setAnnouncements((prev) => [announcement, ...(Array.isArray(prev) ? prev : [])]);
    return announcement;
  };

  const updateAnnouncement = (id: string, patch: Partial<Announcement>) => {
    setAnnouncements((prev) => (
      (Array.isArray(prev) ? prev : []).map((announcement) => (
        announcement.id === id
          ? { ...announcement, ...patch, updatedAt: new Date().toISOString() }
          : announcement
      ))
    ));
  };

  const deleteAnnouncement = (id: string) => {
    setAnnouncements((prev) => (Array.isArray(prev) ? prev : []).filter((announcement) => announcement.id !== id));
  };

  return {
    announcements,
    isLoading,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
  };
}
