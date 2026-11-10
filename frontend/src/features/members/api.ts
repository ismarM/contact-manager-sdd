import { useEffect, useMemo, useState } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import { useListLanguage } from '../groups/api';
import type { GroupDetail } from '../groups/types';
import type { AssignableRole, Member, Members, MembersParams } from './types';

// Odjemalec API članov (plan.md – REST endpoints, contracts/openapi.yaml).

export interface MembersApi {
  list(groupId: string, params: MembersParams): Promise<Members>;
  changeRole(
    groupId: string,
    memberId: string,
    input: { role: AssignableRole; version: number },
  ): Promise<Member>;
  remove(groupId: string, memberId: string): Promise<void>;
  leave(groupId: string): Promise<void>;
  transferOwnership(groupId: string, memberId: string): Promise<GroupDetail>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createMembersApi(authFetch: AuthFetch): MembersApi {
  const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}`;
  const member = (groupId: string, memberId: string) =>
    `${base(groupId)}/members/${encodeURIComponent(memberId)}`;
  return {
    list: (groupId, { page, size, lang }) =>
      authFetch<Members>(
        `${base(groupId)}/members?${new URLSearchParams({
          page: String(page),
          size: String(size),
          lang,
        }).toString()}`,
      ),
    changeRole: (groupId, memberId, input) =>
      authFetch<Member>(member(groupId, memberId), {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      }),
    remove: (groupId, memberId) => authFetch<void>(member(groupId, memberId), { method: 'DELETE' }),
    leave: (groupId) => authFetch<void>(`${base(groupId)}/leave`, { method: 'POST' }),
    transferOwnership: (groupId, memberId) =>
      authFetch<GroupDetail>(`${base(groupId)}/ownership-transfer`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ memberId }),
      }),
  };
}

export function useMembersApi(): MembersApi {
  const { authFetch } = useAuth();
  return useMemo(() => createMembersApi(authFetch), [authFetch]);
}

/**
 * Število članov skupine iz `total` seznama (research R-08, ne iz števila elementov); `undefined`, dokler ni naloženo
 * (ali ob napaki).
 */
export function useMemberCount(groupId: string): number | undefined {
  const api = useMembersApi();
  const lang = useListLanguage();
  const [result, setResult] = useState<{ groupId: string; total: number } | null>(null);
  useEffect(() => {
    let active = true;
    api.list(groupId, { page: 0, size: 1, lang }).then(
      (members) => {
        if (active) setResult({ groupId, total: members.total });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, groupId, lang]);
  return result?.groupId === groupId ? result.total : undefined;
}
