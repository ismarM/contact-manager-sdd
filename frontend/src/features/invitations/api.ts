import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import type {
  AcceptedInvitation,
  InvitationCount,
  InvitationInput,
  OutgoingInvitation,
  OutgoingInvitations,
  PageParams,
  ReceivedInvitations,
} from './types';

// Odjemalec API povabil (plan.md – REST endpoints, contracts/openapi.yaml).

export interface InvitationsApi {
  send(groupId: string, input: InvitationInput): Promise<OutgoingInvitation>;
  listOutgoing(groupId: string, params: PageParams): Promise<OutgoingInvitations>;
  withdraw(groupId: string, invitationId: string): Promise<void>;
  listReceived(params: PageParams): Promise<ReceivedInvitations>;
  count(): Promise<InvitationCount>;
  accept(invitationId: string): Promise<AcceptedInvitation>;
  decline(invitationId: string): Promise<void>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function paging({ page, size }: PageParams): string {
  return new URLSearchParams({ page: String(page), size: String(size) }).toString();
}

export function createInvitationsApi(authFetch: AuthFetch): InvitationsApi {
  const group = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/invitations`;
  const own = (invitationId: string) => `/invitations/${encodeURIComponent(invitationId)}`;
  return {
    send: (groupId, input) =>
      authFetch<OutgoingInvitation>(group(groupId), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      }),
    listOutgoing: (groupId, params) =>
      authFetch<OutgoingInvitations>(`${group(groupId)}?${paging(params)}`),
    withdraw: (groupId, invitationId) =>
      authFetch<void>(`${group(groupId)}/${encodeURIComponent(invitationId)}`, {
        method: 'DELETE',
      }),
    listReceived: (params) => authFetch<ReceivedInvitations>(`/invitations?${paging(params)}`),
    count: () => authFetch<InvitationCount>('/invitations/count'),
    accept: (invitationId) =>
      authFetch<AcceptedInvitation>(`${own(invitationId)}/accept`, { method: 'POST' }),
    decline: (invitationId) => authFetch<void>(`${own(invitationId)}/decline`, { method: 'POST' }),
  };
}

export function useInvitationsApi(): InvitationsApi {
  const { authFetch } = useAuth();
  return useMemo(() => createInvitationsApi(authFetch), [authFetch]);
}
