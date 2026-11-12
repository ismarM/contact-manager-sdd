import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/authContext';
import type {
  Comparison,
  DuplicateCategory,
  DuplicatePage,
  MergeRequest,
  MergeResponse,
} from './types';

// Odjemalec API dvojnikov (plan.md – REST endpoints, contracts/openapi.yaml). Strani so 0-osne kot v API.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createDuplicatesApi(authFetch: AuthFetch) {
  const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/duplicates`;
  return {
    searchDuplicates(
      groupId: string,
      query: { category: DuplicateCategory; page: number; size: number },
    ): Promise<DuplicatePage> {
      const params = new URLSearchParams({
        category: query.category,
        page: String(query.page),
        size: String(query.size),
      });
      return authFetch<DuplicatePage>(`${base(groupId)}?${params.toString()}`);
    },
    compareContacts(groupId: string, ids: string[]): Promise<Comparison> {
      const params = new URLSearchParams({ ids: ids.join(',') });
      return authFetch<Comparison>(`${base(groupId)}/compare?${params.toString()}`);
    },
    mergeContacts(groupId: string, request: MergeRequest): Promise<MergeResponse> {
      return authFetch<MergeResponse>(`${base(groupId)}/merge`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(request),
      });
    },
  };
}

export type DuplicatesApi = ReturnType<typeof createDuplicatesApi>;

export function useDuplicatesApi(): DuplicatesApi {
  const { authFetch } = useAuth();
  return useMemo(() => createDuplicatesApi(authFetch), [authFetch]);
}

/** Izid neuspele združitve (research R-12 – Izidi); brez tehničnih kod za prikaz. */
export type MergeFailure =
  | { kind: 'conflict' }
  | { kind: 'validation'; fields: { field: string; code: string }[] }
  | { kind: 'forbidden' }
  | { kind: 'archived' }
  | { kind: 'failed' }
  | { kind: 'offline' };

function fieldErrors(body: unknown): { field: string; code: string }[] {
  if (!body || typeof body !== 'object' || !('errors' in body) || !Array.isArray(body.errors)) {
    return [];
  }
  return body.errors.flatMap((error: unknown) =>
    error &&
    typeof error === 'object' &&
    'field' in error &&
    typeof error.field === 'string' &&
    'code' in error &&
    typeof error.code === 'string'
      ? [{ field: error.field, code: error.code }]
      : [],
  );
}

/** Razvrsti napako `merge`: `409 VERSION_CONFLICT`, `400` z `result.*`, `403`, `409 GROUP_ARCHIVED`, `5xx`, brez povezave. */
export function classifyMergeError(error: unknown): MergeFailure {
  if (!(error instanceof ApiError)) return { kind: 'offline' };
  if (error.status === 409 && error.code === 'VERSION_CONFLICT') return { kind: 'conflict' };
  if (error.status === 409 && error.code === 'GROUP_ARCHIVED') return { kind: 'archived' };
  if (error.status === 403) return { kind: 'forbidden' };
  if (error.status === 400) {
    const fields = fieldErrors(error.body);
    if (fields.length > 0) return { kind: 'validation', fields };
  }
  return { kind: 'failed' };
}
