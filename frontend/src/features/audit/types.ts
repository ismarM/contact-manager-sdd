import type { UserRef } from '../groups/types';

// Oblike odgovorov API revizijske sledi (specs/005-revizijska-sled/contracts/openapi.yaml).

/** Vrste dejanj, ki jih vmesnik pozna (filter, stavki); zaledje lahko zapiše tudi novejše (FR-015-18). */
export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'MERGE',
  'ROLLBACK',
  'RESTORE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isKnownAction(action: string): action is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(action);
}

/** Izvajalec sledi (015, `GET /audit/actors`): `id` je žeton ali `deleted`. */
export interface Actor {
  id: string;
  kind: 'MEMBER' | 'FORMER' | 'DELETED';
  /** `null` = izbrisan uporabnik. */
  user: UserRef | null;
}

export interface ActorList {
  items: Actor[];
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  /** `null` = izbrisan uporabnik (feature-map §2.5). */
  actor: UserRef | null;
  /** Znana vrsta (`AuditAction`) ali novejša, ki jo vmesnik prikaže s splošnim stavkom (FR-015-18). */
  action: string;
  contactCount: number;
  /** Prikazno ime ob času vnosa, kadar je `contactCount = 1`. */
  contactName: string | null;
  /** `ROLLBACK` in `RESTORE` na vnos: ciljni vnos T. */
  target: { entryId: string; createdAt: string } | null;
  /** `ROLLBACK` na *Začetno stanje*, `RESTORE` na izhodiščno različico. */
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
  /** 015: izbrani izvajalec; `null` ali odsoten, kadar filtra ni ali žeton ni izvajalec te sledi. */
  actorFilter?: Actor | null;
}

export type ChangeFieldName =
  | 'FIRST_NAME'
  | 'LAST_NAME'
  | 'COMPANY'
  | 'ADDRESS'
  | 'COUNTRY'
  | 'EMAIL'
  | 'PHONE'
  | 'ATTRIBUTE'
  | 'TAGS';

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

/** Filtri sledi iz poti (`?action=`, `?contact=`, `?actor=`). */
export interface AuditFilters {
  actions: AuditAction[];
  contact: string | null;
  /** Žeton izvajalca ali `deleted`. */
  actor: string | null;
}
