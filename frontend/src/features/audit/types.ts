import type { Address, AttributeType } from '../attributes/types';
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
  'IMPORT',
  'ATTRIBUTE_TYPE',
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

/** 018: dogodek slike kontakta v vnosu `UPDATE` (brez vsebine slike). */
export type PhotoChange = 'ADDED' | 'REPLACED' | 'REMOVED';

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
  /** 018: vnos je spremenil sliko kontakta; odsoten/`null` = ni dogodka slike. */
  photoChange?: PhotoChange | null;
  /** `ATTRIBUTE_TYPE` (016): ključ in tipa pred/po; pri drugih vrstah odsotni. */
  attributeKey?: string;
  typeBefore?: AttributeType;
  typeAfter?: AttributeType;
  /** 019: ime API ključa, s katerim je bila sprememba narejena; `null` = spletna aplikacija ali izbrisan uporabnik. */
  apiKeyName?: string | null;
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

/** Vrednost atributa v spremembi (016, FR-016-26): tip ključa ob posnetku in besedilo ali deli naslova. */
export interface AttributeChangeValue {
  type: AttributeType;
  value?: string;
  parts?: Address;
}

/** Besedilo, seznam značk, deli naslova (`ADDRESS` razčlenjen), vrednost atributa ali prazno. */
export type ChangeValue = string | string[] | Address | AttributeChangeValue | null;

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
