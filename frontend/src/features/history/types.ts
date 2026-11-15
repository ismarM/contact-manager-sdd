import type { ChangeField } from '../audit/types';
import type { UserRef } from '../groups/types';

// Oblike odgovorov API zgodovine kontakta (specs/015-napredna-revizija/contracts/openapi.yaml).

export type ContactStatus = 'ACTIVE' | 'DELETED' | 'MERGED';
export type ChangeKind = 'ADDED' | 'CHANGED' | 'REMOVED';

/** Sklic na različico: `entryId`, `initial` ali `current` (samo za obstoječ kontakt). */
export type VersionRef = string;
export const INITIAL = 'initial';
export const CURRENT = 'current';
/** Pri obnovi: zadnja zabeležena različica kontakta (sklic se razreši iz zgodovine). */
export const LATEST = 'latest';

export interface HistoryEvent {
  entryId: string;
  createdAt: string;
  /** `null` = izbrisan uporabnik. */
  actor: UserRef | null;
  /** Besedilo: znana vrsta ali novejša (FR-015-18). */
  action: string;
  kind: ChangeKind;
  entryContactCount: number;
  displayName: string;
  fields: ChangeField[];
  /** Stanje po dogodku obstaja (`after` ni prazen). */
  hasVersion: boolean;
  /** `RESTORE`: ciljni vnos; `ROLLBACK`: ciljni vnos. */
  target: { entryId: string; createdAt: string } | null;
  targetInitial: boolean;
  /** Samo `MERGE` + `REMOVED`: ohranjeni kontakt. */
  mergedInto: { contactId: string; displayName: string } | null;
}

export interface History {
  contact: {
    id: string;
    displayName: string;
    status: ContactStatus;
    /** Samo `ACTIVE`. */
    version: number | null;
    /** Najnovejši vnos kontakta (žeton obnove izbrisanega kontakta). */
    lastEntryId: string | null;
    hasInitial: boolean;
  };
  total: number;
  /** 0-osna stran. */
  page: number;
  size: number;
  items: HistoryEvent[];
}

export interface ContactStateView {
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  country: string | null;
  attributes: { key: string; value: string }[];
  tags: string[];
  version: number;
}

export interface Version {
  ref: VersionRef;
  /** `null` za `initial` in `current`. */
  createdAt: string | null;
  actor: UserRef | null;
  action: string | null;
  state: ContactStateView;
}

export interface Comparison {
  from: Version;
  to: Version;
  changes: ChangeField[];
}

export interface Duplicate {
  contactId: string;
  displayName: string;
  reason: 'EMAIL' | 'NAME';
}

export interface RestorePreview {
  target: Version;
  changes: ChangeField[];
  status: ContactStatus;
  restorable: boolean;
  reason: 'MERGED' | 'NO_CHANGES' | null;
  currentVersion: number | null;
  lastEntryId: string | null;
  duplicates: Duplicate[];
}

/** Telo obnove: `version` za obstoječ kontakt, `lastEntryId` za izbrisan. */
export interface RestoreRequest {
  from: VersionRef;
  version?: number;
  lastEntryId?: string;
}

export type DeletedReason = 'DELETED' | 'ROLLBACK' | 'MERGED';
export type DeletedState = 'all' | 'restorable' | 'merged';

export interface DeletedItem {
  contactId: string;
  displayName: string;
  email: string | null;
  company: string | null;
  removedAt: string;
  removedBy: UserRef | null;
  entryId: string;
  reason: DeletedReason;
  restorable: boolean;
  mergedInto: { contactId: string; displayName: string; exists: boolean } | null;
}

export interface DeletedPage {
  total: number;
  page: number;
  size: number;
  items: DeletedItem[];
}

export interface DeletedQuery {
  q: string;
  state: DeletedState;
}
