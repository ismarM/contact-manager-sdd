import type { UserRef } from '../groups/types';
import type { Address, AttributeType } from '../attributes/types';

// Oblike odgovorov API kontaktov (specs/004-kontakti/contracts/openapi.yaml).

/** Oznaka *Povrnjeno* (specs/005-revizijska-sled/contracts/openapi.yaml – RevertInfo). */
export interface RevertInfo {
  rollbackEntryId: string;
  rolledBackAt: string;
  /** `null` = izbrisan uporabnik. */
  rolledBackBy: UserRef | null;
  /** `null` pri *Začetnem stanju*. */
  targetEntryId: string | null;
  targetAt: string | null;
  targetInitial: boolean;
}

export interface Attribute {
  key: string;
  /**
   * 016: tip ključa v skupini. Odgovor ga vedno vsebuje; zahtevek ga pošlje samo za nov ključ (sicer velja tip ključa),
   * manjkajoč = `OTHER`.
   */
  type?: AttributeType;
  /** Kanonična vrednost; `null` pri razčlenjenem naslovu (`parts`). */
  value: string | null;
  /** 016: deli naslova (samo tip `ADDRESS`); natanko eno od `value` in `parts`. */
  parts?: Address | null;
}

/** Telo `POST …/contacts` in (z `version`) `PUT …/contacts/{contactId}`. */
export interface ContactInput {
  firstName: string | null;
  lastName: string | null;
  /** 013: do 200 znakov. */
  company: string | null;
  address: string | null;
  /** 016: razčlenjen naslov; največ eno od `address` in `addressParts` ni `null`; manjka = `null`. */
  addressParts?: Address | null;
  /** 013: koda ISO 3166-1 alpha-2 (npr. `SI`). */
  country: string | null;
  email: string | null;
  phone: string | null;
  attributes: Attribute[];
  tags: string[];
}

export interface ContactDetail extends ContactInput {
  id: string;
  displayName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** `null` = izbrisan uporabnik (feature-map §2.5). */
  updatedBy: UserRef | null;
  /** 005: oznaka *Povrnjeno*; neobvezno, da testni podatki 004 ostanejo nespremenjeni. */
  reverted?: RevertInfo | null;
}

export interface ContactSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  version: number;
  /** 005: kontakt ima oznako *Povrnjeno*; neobvezno kot zgoraj. */
  reverted?: boolean;
}

export interface ContactPage {
  total: number;
  /** 0-osna stran. */
  page: number;
  size: number;
  items: ContactSummary[];
}

/** 013: vrsta predlogov `GET …/suggestions?type=` (contracts/openapi.yaml). */
export type SuggestionType = 'key' | 'value' | 'company' | 'tag' | 'country';

export interface Suggestion {
  /** Besedilo predloga; pri `country` koda ISO. */
  text: string;
  count: number;
}

export interface Suggestions {
  items: Suggestion[];
}

/** 013: izid prepoznavanja države iz besedila (`POST /countries/resolve`). */
export interface CountryResolution {
  input: string;
  status: 'FOUND' | 'AMBIGUOUS' | 'UNKNOWN';
  /** Samo `FOUND`. */
  code?: string | null;
  /** Samo `AMBIGUOUS`: kode, do 10. */
  candidates?: string[];
}

/** Možnosti filtrov skupine (contracts/openapi.yaml – ContactFilterOptions). */
export interface ContactFilterOptions {
  keys: string[];
  tags: string[];
}

// --- 009: izbor in množično urejanje (specs/009-mnozicno-urejanje/contracts/openapi.yaml) --------------------------

/** Odgovor `GET …/contact-ids`: pri `total > 10 000` je `ids` prazen in `truncated` resničen. */
export interface ContactIds {
  total: number;
  truncated: boolean;
  ids: string[];
}

/** Poizvedba »Izberi vse zadetke« v telesu `selection-check` (kanonični `q`, `f`, `tag` iz 008). */
export interface SelectionCheckQuery {
  q?: string;
  f?: string[];
  tag?: string[];
  contactIds: string[];
  excludedIds?: string[];
}

export interface SelectionCheckRequest {
  contactIds: string[];
  queries: SelectionCheckQuery[];
}

export interface SelectionCheckResult {
  changed: boolean;
  missing: string[];
  queries: { newMatches: string[]; noLongerMatching: string[] }[];
}

/** Telo `POST …/contacts/export` (010): izbrane identitete, razvrstitev seznama in jezik glave datoteke. */
export interface ExportRequest {
  contactIds: string[];
  sort?: string;
  dir?: 'asc' | 'desc';
  language: 'sl' | 'en';
}

export type BulkField = 'address' | 'email' | 'phone' | 'company' | 'country' | 'custom';

export interface AttributeSet {
  field: BulkField;
  /** Samo pri `custom`. */
  key?: string;
  value: string;
}

export interface BulkUpdateRequest {
  contactIds: string[];
  addTags?: string[];
  removeTags?: string[];
  attributes?: AttributeSet[];
}

export interface BulkDeleteRequest {
  contactIds: string[];
}

export interface BulkUpdateResult {
  changed: number;
}

export interface BulkDeleteResult {
  deleted: number;
}

export interface BulkFieldError {
  field: string;
  code: string;
}

export interface BulkContactErrors {
  contactId: string;
  displayName: string;
  errors: BulkFieldError[];
}
