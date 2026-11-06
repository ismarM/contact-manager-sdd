import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AuthFetch } from '../../shared/api/authFetch';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/authContext';
import type { ArchivedGroups, GroupDetail, GroupInput, GroupSections, Role } from './types';

// Odjemalec API skupin (plan.md – REST endpoints, contracts/openapi.yaml).

export interface ListParams {
  role?: Role;
  page?: number;
  size: number;
  lang: 'sl' | 'en';
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createGroupsApi(authFetch: AuthFetch) {
  return {
    listGroups({ role, page, size, lang }: ListParams): Promise<GroupSections> {
      const query = new URLSearchParams();
      if (role) query.set('role', role);
      if (page !== undefined) query.set('page', String(page));
      query.set('size', String(size));
      query.set('lang', lang);
      return authFetch<GroupSections>(`/groups?${query.toString()}`);
    },
    getGroup(groupId: string): Promise<GroupDetail> {
      return authFetch<GroupDetail>(`/groups/${encodeURIComponent(groupId)}`);
    },
    createGroup(input: GroupInput): Promise<GroupDetail> {
      return authFetch<GroupDetail>('/groups', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
    },
    listArchived({ page, size, lang }: ListParams): Promise<ArchivedGroups> {
      const query = new URLSearchParams();
      if (page !== undefined) query.set('page', String(page));
      query.set('size', String(size));
      query.set('lang', lang);
      return authFetch<ArchivedGroups>(`/groups/archived?${query.toString()}`);
    },
    archiveGroup(groupId: string): Promise<GroupDetail> {
      return authFetch<GroupDetail>(`/groups/${encodeURIComponent(groupId)}/archive`, {
        method: 'POST',
      });
    },
    unarchiveGroup(groupId: string): Promise<GroupDetail> {
      return authFetch<GroupDetail>(`/groups/${encodeURIComponent(groupId)}/unarchive`, {
        method: 'POST',
      });
    },
    deleteGroup(groupId: string): Promise<void> {
      return authFetch<void>(`/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
    },
    updateGroup(groupId: string, input: GroupInput & { version: number }): Promise<GroupDetail> {
      return authFetch<GroupDetail>(`/groups/${encodeURIComponent(groupId)}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
    },
  };
}

export type GroupsApi = ReturnType<typeof createGroupsApi>;

export function useGroupsApi(): GroupsApi {
  const { authFetch } = useAuth();
  return useMemo(() => createGroupsApi(authFetch), [authFetch]);
}

/** Jezik vmesnika za razvrščanje na zaledju (research R-04). */
export function useListLanguage(): 'sl' | 'en' {
  const { i18n } = useTranslation();
  return (i18n.resolvedLanguage ?? i18n.language).startsWith('sl') ? 'sl' : 'en';
}

/** Napake po poljih iz `400 VALIDATION_FAILED` (prazno, če jih ni). */
export function fieldErrors(error: unknown): { field: string; code: string }[] {
  if (!(error instanceof ApiError) || error.status !== 400) return [];
  const body = error.body;
  if (body && typeof body === 'object' && 'errors' in body && Array.isArray(body.errors)) {
    return (body.errors as unknown[]).filter(
      (item): item is { field: string; code: string } =>
        !!item &&
        typeof item === 'object' &&
        'field' in item &&
        typeof item.field === 'string' &&
        'code' in item &&
        typeof item.code === 'string',
    );
  }
  return [];
}

/** Ključ sporočila neuspeha akcije (design.md 8.13): brez tehničnih kod; omrežna napaka = brez povezave. */
export function failureKey(
  error: unknown,
  fallback: 'groups.createFailed' | 'groups.details.saveFailed',
):
  | 'groups.offline'
  | 'groups.details.archived'
  | 'groups.details.forbidden'
  | 'groups.createFailed'
  | 'groups.details.saveFailed' {
  if (!(error instanceof ApiError)) return 'groups.offline';
  if (error.status === 409 && error.code === 'GROUP_ARCHIVED') return 'groups.details.archived';
  if (error.status === 403) return 'groups.details.forbidden';
  return fallback;
}

/** Ključ sporočila neuspeha dejanja upravljanja (design.md 8.13): brez kod; omrežna napaka = brez povezave. */
export function manageFailureKey(
  error: unknown,
  fallback:
    'groups.manage.archiveFailed' | 'groups.manage.unarchiveFailed' | 'groups.manage.deleteFailed',
):
  | 'groups.offline'
  | 'groups.details.forbidden'
  | 'groups.deleteDialog.hasMembers'
  | typeof fallback {
  if (!(error instanceof ApiError)) return 'groups.offline';
  if (error.status === 403) return 'groups.details.forbidden';
  if (error.status === 409 && error.code === 'GROUP_HAS_OTHER_MEMBERS') {
    return 'groups.deleteDialog.hasMembers';
  }
  return fallback;
}
