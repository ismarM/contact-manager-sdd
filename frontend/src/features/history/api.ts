import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { ApiError } from '../../shared/api/client';
import type { AuditEntry } from '../audit/types';
import { useAuth } from '../auth/authContext';
import type {
  Comparison,
  DeletedPage,
  DeletedQuery,
  History,
  RestorePreview,
  RestoreRequest,
  Version,
} from './types';

// Odjemalec API zgodovine kontakta (plan.md 015 – REST endpoints, contracts/openapi.yaml). Strani so 0-osne kot v API.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createHistoryApi(authFetch: AuthFetch) {
  const contactBase = (groupId: string, contactId: string) =>
    `/groups/${encodeURIComponent(groupId)}/contacts/${encodeURIComponent(contactId)}`;
  return {
    getHistory(groupId: string, contactId: string, page: number, size: number): Promise<History> {
      const query = new URLSearchParams({ page: String(page), size: String(size) });
      return authFetch<History>(`${contactBase(groupId, contactId)}/history?${query.toString()}`);
    },
    getVersion(groupId: string, contactId: string, ref: string): Promise<Version> {
      return authFetch<Version>(
        `${contactBase(groupId, contactId)}/versions/${encodeURIComponent(ref)}`,
      );
    },
    compare(groupId: string, contactId: string, from: string, to: string): Promise<Comparison> {
      const query = new URLSearchParams({ from, to });
      return authFetch<Comparison>(
        `${contactBase(groupId, contactId)}/compare?${query.toString()}`,
      );
    },
    restorePreview(groupId: string, contactId: string, from: string): Promise<RestorePreview> {
      const query = new URLSearchParams({ from });
      return authFetch<RestorePreview>(
        `${contactBase(groupId, contactId)}/restore-preview?${query.toString()}`,
      );
    },
    restore(groupId: string, contactId: string, body: RestoreRequest): Promise<AuditEntry> {
      return authFetch<AuditEntry>(`${contactBase(groupId, contactId)}/restore`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
    },
    listDeleted(
      groupId: string,
      page: number,
      size: number,
      query: DeletedQuery,
    ): Promise<DeletedPage> {
      const params = new URLSearchParams({ page: String(page), size: String(size) });
      if (query.q) params.set('q', query.q);
      if (query.state !== 'all') params.set('state', query.state);
      return authFetch<DeletedPage>(
        `/groups/${encodeURIComponent(groupId)}/deleted-contacts?${params.toString()}`,
      );
    },
  };
}

export type HistoryApi = ReturnType<typeof createHistoryApi>;

export function useHistoryApi(): HistoryApi {
  const { authFetch } = useAuth();
  return useMemo(() => createHistoryApi(authFetch), [authFetch]);
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
