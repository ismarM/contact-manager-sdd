import type { UserRef } from '../groups/types';

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
  value: string;
}

/** Telo `POST …/contacts` in (z `version`) `PUT …/contacts/{contactId}`. */
export interface ContactInput {
  firstName: string | null;
  lastName: string | null;
  address: string | null;
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

export interface TagSuggestions {
  tags: string[];
}

/** Možnosti filtrov skupine (contracts/openapi.yaml – ContactFilterOptions). */
export interface ContactFilterOptions {
  keys: string[];
  tags: string[];
}
