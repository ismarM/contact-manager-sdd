import type { GroupColor, UserRef } from '../groups/types';

// Oblike odgovorov API povabil (specs/006-povabila/contracts/openapi.yaml).

/** Vloge, ki jih je mogoče ponuditi s povabilom (lastnik je samo ustanovitelj skupine). */
export type OfferedRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface InvitationGroup {
  id: string;
  title: string;
  color: GroupColor;
  archived: boolean;
}

/** Prejeto povabilo; `invitedBy: null` pomeni izbrisanega uporabnika. */
export interface ReceivedInvitation {
  id: string;
  group: InvitationGroup;
  role: OfferedRole;
  invitedBy: UserRef | null;
  createdAt: string;
}

export interface ReceivedInvitations {
  total: number;
  page: number;
  size: number;
  items: ReceivedInvitation[];
}

/** Čakajoče povabilo skupine; `canWithdraw` določi strežnik (lastnik vedno, admin ne za vlogo ADMIN). */
export interface OutgoingInvitation {
  id: string;
  inviteeEmail: string;
  role: OfferedRole;
  invitedBy: UserRef | null;
  createdAt: string;
  canWithdraw: boolean;
}

export interface OutgoingInvitations {
  total: number;
  page: number;
  size: number;
  items: OutgoingInvitation[];
}

export interface AcceptedInvitation {
  groupId: string;
  title: string;
  role: OfferedRole;
  archived: boolean;
}

export interface InvitationCount {
  count: number;
}

export interface InvitationInput {
  email: string;
  role: OfferedRole;
}

export interface PageParams {
  page: number;
  size: number;
}
