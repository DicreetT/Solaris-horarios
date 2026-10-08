import { HEIDY_ID, USERS } from '../constants';
import type { User } from '../types';

const EXTRA_ALIASES_BY_USER_ID: Record<string, string[]> = {
  [HEIDY_ID]: ['heidi', 'heidy'],
};

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function slugText(value: string) {
  return normalizeText(value)
    .replace(/^#+/, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function aliasesForUser(user: User) {
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const emailAlias = user.email.split('@')[0] || '';
  const baseAliases = [user.name, firstName, emailAlias, ...(EXTRA_ALIASES_BY_USER_ID[user.id] || [])];

  if (normalizeText(user.name).includes('anabella')) baseAliases.push('anabela', 'anabella');
  if (normalizeText(user.name).includes('itzi')) baseAliases.push('itziar', 'ichi', 'itch', 'itzi');
  if (normalizeText(user.name).includes('thalia')) baseAliases.push('talia', 'thalia');
  if (normalizeText(user.name).includes('fer')) baseAliases.push('fernando', 'fer');

  return Array.from(new Set(baseAliases.map(normalizeText).filter(Boolean)));
}

export function findMentionedUsersInText(value: unknown, users: User[] = USERS) {
  const normalized = ` ${normalizeText(value)} `;
  if (!normalized.trim()) return [];

  return users.filter((user) => (
    aliasesForUser(user).some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,;:!?)/-])`, 'i').test(normalized);
    })
  ));
}

export function parseTagInput(value: unknown) {
  const raw = String(value || '');
  const hashTags = Array.from(raw.matchAll(/#[\p{L}\p{N}_-]+/gu)).map((match) => match[0]);
  const commaTags = raw
    .replace(/#[\p{L}\p{N}_-]+/gu, ' ')
    .split(/[,\n;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return Array.from(new Set([...hashTags, ...commaTags].map(slugText).filter(Boolean)));
}
