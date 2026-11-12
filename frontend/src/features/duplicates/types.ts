// Tipi API dvojnikov (specs/011-dvojniki/data-model.md, contracts/openapi.yaml).

export type DuplicateCategory = 'name' | 'email' | 'phone';

export interface DuplicateContact {
  id: string;
  displayName: string;
}

export interface DuplicateGroup {
  reason: { category: DuplicateCategory; value: string };
  size: number;
  /** Vsi kontakti skupine, najstarejši prvi; v primerjavo gre prvih 10. */
  contacts: DuplicateContact[];
}

export interface DuplicatePage {
  category: DuplicateCategory;
  total: number;
  /** 0-osno. */
  page: number;
  size: number;
  groups: DuplicateGroup[];
}

export interface CompareContact {
  id: string;
  version: number;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  attributes: { key: string; value: string }[];
  tags: string[];
}

export interface Comparison {
  contacts: CompareContact[];
}

/** Končne vrednosti združenega kontakta (`result` v telesu `merge`). */
export interface MergeResultInput {
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  attributes: { key: string; value: string }[];
  tags: string[];
}

export interface MergeRequest {
  contacts: { id: string; version: number }[];
  result: MergeResultInput;
}

export interface MergeResponse {
  keptContactId: string;
  keptDisplayName: string;
  mergedCount: number;
  auditEntryId: string;
}
