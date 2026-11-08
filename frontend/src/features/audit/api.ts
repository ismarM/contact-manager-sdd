import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import type { AuditEntry, AuditFilters, AuditPage, ChangePage } from './types';

// Odjemalec API revizijske sledi (plan.md – REST endpoints, contracts/openapi.yaml). Ogrodje: funkcije še niso
// izvedene.

export function createAuditApi(authFetch: AuthFetch) {
  void authFetch;
  const notImplemented = (): never => {
    throw new Error('not implemented');
  };
  return {
    listAudit(
      groupId: string,
      page: number,
      size: number,
      filters: AuditFilters,
    ): Promise<AuditPage> {
      void [groupId, page, size, filters];
      return Promise.resolve(notImplemented());
    },
    getAuditEntry(groupId: string, entryId: string): Promise<AuditEntry> {
      void [groupId, entryId];
      return Promise.resolve(notImplemented());
    },
    listChanges(groupId: string, entryId: string, page: number, size: number): Promise<ChangePage> {
      void [groupId, entryId, page, size];
      return Promise.resolve(notImplemented());
    },
    rollback(groupId: string, entryId: string, latestEntryId: string): Promise<AuditEntry> {
      void [groupId, entryId, latestEntryId];
      return Promise.resolve(notImplemented());
    },
    rollbackInitial(groupId: string, latestEntryId: string): Promise<AuditEntry> {
      void [groupId, latestEntryId];
      return Promise.resolve(notImplemented());
    },
  };
}

export type AuditApi = ReturnType<typeof createAuditApi>;

export function useAuditApi(): AuditApi {
  const { authFetch } = useAuth();
  return useMemo(() => createAuditApi(authFetch), [authFetch]);
}
