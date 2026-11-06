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
