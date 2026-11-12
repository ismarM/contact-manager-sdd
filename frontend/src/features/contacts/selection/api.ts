import { useMemo } from 'react';

import type { AuthFetch } from '../../../shared/api/authFetch';
import { useAuth } from '../../auth/authContext';
import type { ContactQuery } from '../contactQuery';
import { toApiParams } from '../contactQuery';
import type {
  BulkDeleteRequest,
  BulkDeleteResult,
  BulkUpdateRequest,
  BulkUpdateResult,
  ContactIds,
  SelectionCheckRequest,
  SelectionCheckResult,
} from '../types';
import type { SelectionParams } from './selection';

// Odjemalec endpointov izbora in množičnih operacij (plan.md – REST endpoints, contracts/openapi.yaml).

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Kanonični iskalni parametri (`q`, `f`, `tag`) trenutne poizvedbe 008; razvrstitev in stran ne vplivata na izbor. */
export function selectionParams(query: ContactQuery): SelectionParams {
  const params = toApiParams(query);
  return { q: params.get('q') ?? '', f: params.getAll('f'), tag: params.getAll('tag') };
}

export function createSelectionApi(authFetch: AuthFetch) {
  const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}`;
  const post = <T>(groupId: string, endpoint: string, body: unknown) =>
    authFetch<T>(`${base(groupId)}/contacts/${endpoint}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  return {
    contactIds(groupId: string, params: SelectionParams): Promise<ContactIds> {
      const search = new URLSearchParams();
      if (params.q !== '') search.set('q', params.q);
      for (const f of params.f) search.append('f', f);
      for (const tag of params.tag) search.append('tag', tag);
      return authFetch<ContactIds>(`${base(groupId)}/contact-ids?${search.toString()}`);
    },
    selectionCheck(groupId: string, request: SelectionCheckRequest): Promise<SelectionCheckResult> {
      return post<SelectionCheckResult>(groupId, 'selection-check', request);
    },
    bulkUpdate(groupId: string, request: BulkUpdateRequest): Promise<BulkUpdateResult> {
      return post<BulkUpdateResult>(groupId, 'bulk-update', request);
    },
    bulkDelete(groupId: string, request: BulkDeleteRequest): Promise<BulkDeleteResult> {
      return post<BulkDeleteResult>(groupId, 'bulk-delete', request);
    },
  };
}

export type SelectionApi = ReturnType<typeof createSelectionApi>;

export function useSelectionApi(): SelectionApi {
  const { authFetch } = useAuth();
  return useMemo(() => createSelectionApi(authFetch), [authFetch]);
}
