import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import type { AuditEntry, AuditFilters, AuditPage, ChangePage } from './types';

// Odjemalec API revizijske sledi (plan.md – REST endpoints, contracts/openapi.yaml). Strani so 0-osne kot v API.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createAuditApi(authFetch: AuthFetch) {
  const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/audit`;
  return {
    listAudit(
      groupId: string,
      page: number,
      size: number,
      filters: AuditFilters,
    ): Promise<AuditPage> {
      const query = new URLSearchParams({ page: String(page), size: String(size) });
      for (const action of filters.actions) query.append('action', action);
      if (filters.contact) query.set('contact', filters.contact);
      return authFetch<AuditPage>(`${base(groupId)}?${query.toString()}`);
    },
    getAuditEntry(groupId: string, entryId: string): Promise<AuditEntry> {
      return authFetch<AuditEntry>(`${base(groupId)}/${encodeURIComponent(entryId)}`);
    },
    listChanges(groupId: string, entryId: string, page: number, size: number): Promise<ChangePage> {
      const query = new URLSearchParams({ page: String(page), size: String(size) });
      return authFetch<ChangePage>(
        `${base(groupId)}/${encodeURIComponent(entryId)}/changes?${query.toString()}`,
      );
    },
    rollback(groupId: string, entryId: string, latestEntryId: string): Promise<AuditEntry> {
      return authFetch<AuditEntry>(`${base(groupId)}/${encodeURIComponent(entryId)}/rollback`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ latestEntryId }),
      });
    },
    rollbackInitial(groupId: string, latestEntryId: string): Promise<AuditEntry> {
      return authFetch<AuditEntry>(`${base(groupId)}/initial-state/rollback`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ latestEntryId }),
      });
    },
  };
}

export type AuditApi = ReturnType<typeof createAuditApi>;

export function useAuditApi(): AuditApi {
  const { authFetch } = useAuth();
  return useMemo(() => createAuditApi(authFetch), [authFetch]);
}
