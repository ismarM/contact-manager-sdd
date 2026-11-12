// Oblike odgovorov funkcionalnosti 012 (specs/012-moji-podatki/contracts/openapi.yaml).

export interface MyData {
  formatVersion: number;
  exportedAt: string;
  profile: {
    name: string | null;
    email: string;
    registeredAt: string;
    language: 'sl' | 'en' | null;
    theme: 'light' | 'dark' | null;
  };
  memberships: {
    groupTitle: string;
    role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
    joinedAt: string;
    state: 'ACTIVE' | 'ARCHIVED' | 'PERMANENTLY_ARCHIVED';
  }[];
  receivedInvitations: {
    groupTitle: string;
    offeredRole: 'ADMIN' | 'EDITOR' | 'VIEWER';
    sender: { name: string | null; deleted: boolean };
    createdAt: string;
  }[];
  sentInvitations: {
    groupTitle: string;
    offeredRole: 'ADMIN' | 'EDITOR' | 'VIEWER';
    inviteeEmail: string;
    createdAt: string;
  }[];
  ownedGroups: {
    title: string;
    description: string | null;
    color: string;
    state: 'ACTIVE' | 'ARCHIVED';
    createdAt: string;
  }[];
}

export interface BlockingGroup {
  id: string;
  title: string;
}

export interface DeletionBlockers {
  groups: BlockingGroup[];
}

/** `deleted` = 204 (račun in identiteta izbrisana), `pending` = 202 (brisanje identitete čaka, FR-012-17). */
export type DeletionOutcome = 'deleted' | 'pending';
