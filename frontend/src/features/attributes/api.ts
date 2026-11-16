import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/authContext';
import type {
  AttributeKey,
  AttributeKeyPage,
  AttributeKeyPageSize,
  ChangeTypeRequest,
  TypeConflictDetails,
} from './types';

// Odjemalec API ključev atributov (plan.md 016 – Public Interfaces, contracts/openapi.yaml).

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface AttributeKeysQuery {
  q?: string;
  page?: number;
  size?: AttributeKeyPageSize;
}

export function createAttributesApi(authFetch: AuthFetch) {
  const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/attribute-keys`;
  return {
    /** `GET …/attribute-keys`: ključi v uporabi s tipom; natančno ujemanje s `q` je prvo. */
    listKeys(
      groupId: string,
      query: AttributeKeysQuery = {},
      signal?: AbortSignal,
    ): Promise<AttributeKeyPage> {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.page !== undefined) params.set('page', String(query.page));
      if (query.size !== undefined) params.set('size', String(query.size));
      const search = params.toString();
      return authFetch<AttributeKeyPage>(`${base(groupId)}${search ? `?${search}` : ''}`, {
        signal,
      });
    },
    /** `POST …/attribute-keys/change-type`: atomarna sprememba tipa; pri konfliktu `409 ATTRIBUTE_TYPE_CONFLICT`. */
    changeType(groupId: string, request: ChangeTypeRequest): Promise<AttributeKey> {
      return authFetch<AttributeKey>(`${base(groupId)}/change-type`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(request),
      });
    },
  };
}

export type AttributesApi = ReturnType<typeof createAttributesApi>;

export function useAttributesApi(): AttributesApi {
  const { authFetch } = useAuth();
  return useMemo(() => createAttributesApi(authFetch), [authFetch]);
}

/** Podrobnosti `409 ATTRIBUTE_TYPE_CONFLICT` (sicer `null`). */
export function typeConflictDetails(error: unknown): TypeConflictDetails | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409 ||
    error.code !== 'ATTRIBUTE_TYPE_CONFLICT'
  ) {
    return null;
  }
  const body = error.body;
  return body && typeof body === 'object' && 'details' in body
    ? (body.details as TypeConflictDetails)
    : null;
}

/** Trenutni ključ iz `409 VERSION_CONFLICT` pri spremembi tipa (`details.current`; sicer `null`). */
export function keyConflictCurrent(error: unknown): AttributeKey | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'VERSION_CONFLICT') {
    return null;
  }
  const body = error.body;
  if (!body || typeof body !== 'object') return null;
  const details = 'details' in body ? (body.details as { current?: AttributeKey } | null) : null;
  if (details?.current) return details.current;
  return 'current' in body ? (body.current as AttributeKey) : null;
}
