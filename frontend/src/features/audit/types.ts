import type { UserRef } from '../groups/types';

// Oblike odgovorov API revizijske sledi (specs/005-revizijska-sled/contracts/openapi.yaml).

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'MERGE', 'ROLLBACK'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  createdAt: string;
  /** `null` = izbrisan uporabnik (feature-map §2.5). */
  actor: UserRef | null;
  action: AuditAction;
  contactCount: number;
  /** Prikazno ime ob času vnosa, kadar je `contactCount = 1`. */
  contactName: string | null;
  /** Samo `ROLLBACK` na vnos: ciljni vnos T. */
  target: { entryId: string; createdAt: string } | null;
  /** Samo `ROLLBACK` na *Začetno stanje*. */
  targetInitial: boolean;
}

export interface AuditPage {
  total: number;
  /** 0-osna stran. */
  page: number;
  size: number;
  items: AuditEntry[];
  /** Najnovejši vnos CELOTNE sledi ne glede na filtre; `null` = prazna sled. */
  latestEntryId: string | null;
  contactFilter: { id: string; displayName: string | null } | null;
}

export type ChangeFieldName =
  'FIRST_NAME' | 'LAST_NAME' | 'ADDRESS' | 'EMAIL' | 'PHONE' | 'ATTRIBUTE' | 'TAGS';

export type ChangeValue = string | string[] | null;

export interface ChangeField {
  field: ChangeFieldName;
  /** Ključ dodatnega atributa; `null` za druga polja. */
  key: string | null;
  before: ChangeValue;
  after: ChangeValue;
}

export interface ContactChange {
  contactId: string;
  displayName: string;
  kind: 'ADDED' | 'REMOVED' | 'CHANGED';
  fields: ChangeField[];
}

export interface ChangePage {
  total: number;
  page: number;
  size: number;
  items: ContactChange[];
}

export interface RollbackRequest {
  latestEntryId: string;
}

/** Filtri sledi iz poti (`?action=`, `?contact=`). */
export interface AuditFilters {
  actions: AuditAction[];
  contact: string | null;
}
