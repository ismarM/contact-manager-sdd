import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
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

const notImplemented = (): never => {
  throw new Error('not implemented');
};

/** Ogrodje (007, T007): metode še niso izvedene; izvedejo jih naloge zgodb US1–US5. */
export function createMembersApi(authFetch: AuthFetch): MembersApi {
  void authFetch;
  return {
    list: notImplemented,
    changeRole: notImplemented,
    remove: notImplemented,
    leave: notImplemented,
    transferOwnership: notImplemented,
  };
}

export function useMembersApi(): MembersApi {
  const { authFetch } = useAuth();
  return useMemo(() => createMembersApi(authFetch), [authFetch]);
}

/** Število članov skupine iz `total` seznama (research R-08); `undefined`, dokler ni naloženo. Ogrodje. */
export function useMemberCount(groupId: string): number | undefined {
  void groupId;
  return undefined;
}
