import type { UserRef } from '../groups/types';

// Oblike odgovorov API kontaktov (specs/004-kontakti/contracts/openapi.yaml).

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
