// Oblike odgovorov API skupin (specs/002-skupine/contracts/openapi.yaml).

export const ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const GROUP_COLORS = [
  'tinta',
  'mah',
  'opeka',
  'oker',
  'sliva',
  'morje',
  'grafit',
  'rja',
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export interface UserRef {
  name: string | null;
  email: string;
}

export interface GroupDetail {
  id: string;
  title: string;
  description: string | null;
  color: GroupColor;
  role: Role;
  archived: boolean;
  /** Arhivirana in brez lastnika (izbris računa lastnika, 012). */
  permanentlyArchived: boolean;
  /** Klicatelj sme izbrisati skupino (FR-003-09): edini član in lastnik ali trajno arhivirana skupina. */
  canDelete: boolean;
  version: number;
  updatedAt: string;
  /** `null` = izbrisan uporabnik (feature-map §2.5). */
  updatedBy: UserRef | null;
}

export interface GroupSummary {
  id: string;
  title: string;
  description: string | null;
  color: GroupColor;
  contactCount: number;
}

export interface GroupSection {
  role: Role;
  total: number;
  page: number;
  size: number;
  items: GroupSummary[];
}

export interface GroupSections {
  sections: GroupSection[];
}

/** Telo `POST /api/groups` in (z `version`) `PUT /api/groups/{groupId}`. */
export interface GroupInput {
  title: string;
  description: string | null;
  color: GroupColor;
}

export interface ArchivedGroupSummary {
  id: string;
  title: string;
  description: string | null;
  color: GroupColor;
  contactCount: number;
  role: Role;
  permanentlyArchived: boolean;
}

export interface ArchivedGroups {
  total: number;
  page: number;
  size: number;
  items: ArchivedGroupSummary[];
}
