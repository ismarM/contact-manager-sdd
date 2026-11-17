// Tipi API dvojnikov (specs/011-dvojniki/data-model.md, contracts/openapi.yaml).

export type DuplicateCategory = 'name' | 'email' | 'phone';

export interface DuplicateContact {
  id: string;
  displayName: string;
  /** 018: revizija slike kontakta; odsotno/`null` = brez slike. */
  photoRevision?: number | null;
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

import type { Address, AttributeType } from '../attributes/types';

export interface CompareContact {
  id: string;
  version: number;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  /** 013 */
  company: string | null;
  address: string | null;
  /** 016: razčlenjen naslov (namesto besedila). */
  addressParts?: Address | null;
  /** 013: koda ISO 3166-1 alpha-2. */
  country: string | null;
  email: string | null;
  phone: string | null;
  /** 016: tip ključa; besedilo ali deli naslova. */
  attributes: { key: string; type?: AttributeType; value?: string; parts?: Address }[];
  tags: string[];
  photoRevision?: number | null;
}

export interface Comparison {
  contacts: CompareContact[];
}

/** Končne vrednosti združenega kontakta (`result` v telesu `merge`). */
export interface MergeResultInput {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address: string | null;
  /** 016: razčlenjen naslov namesto `address`. */
  addressParts?: Address | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  attributes: { key: string; value?: string; parts?: Address }[];
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
