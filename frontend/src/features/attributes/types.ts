// Oblike API tipiziranih atributov (docs/specs/016-tipizirani-atributi/contracts/openapi.yaml).

/** Tip ključa atributa v skupini (FR-016-01); `OTHER` je privzeti. */
export const ATTRIBUTE_TYPES = [
  'OTHER',
  'NOTES',
  'EMAIL',
  'PHONE',
  'ADDRESS',
  'URL',
  'DATE',
] as const;

export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/** Strukturiran naslov: vsaj `street` ali `city`; prazni deli so izpuščeni, `country` je koda ISO 3166-1 alpha-2. */
export interface Address {
  street?: string;
  extra?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  country?: string;
}

/** Ključ atributa skupine s tipom, številom kontaktov in verzijo (`GET …/attribute-keys`). */
export interface AttributeKey {
  /** Kanonični zapis ključa (013). */
  key: string;
  type: AttributeType;
  contactCount: number;
  version: number;
}

export interface AttributeKeyPage {
  items: AttributeKey[];
  /** 0-osna stran. */
  page: number;
  size: number;
  total: number;
}

export type AttributeKeyPageSize = 25 | 50 | 100;

/** Telo `POST …/attribute-keys/change-type`; `key` v poljubni velikosti črk. */
export interface ChangeTypeRequest {
  key: string;
  type: AttributeType;
  version: number;
}

/** Kontakt z vrednostjo, ki je novi tip ne sprejme (`details.contacts` pri `409 ATTRIBUTE_TYPE_CONFLICT`, do 100). */
export interface TypeConflictContact {
  contactId: string;
  displayName: string;
  value: string;
}

export interface TypeConflictDetails {
  contacts: TypeConflictContact[];
  /** Skupno število kontaktov v konfliktu (lahko več kot `contacts.length`). */
  total: number;
}

/** Lokacija naslova prek zaledja (FR-016-21); koordinate niso shranjene. */
export interface AddressLocation {
  status: 'EXACT' | 'APPROXIMATE' | 'NOT_FOUND';
  latitude?: number | null;
  longitude?: number | null;
}

/** Predlog samodokončanja naslova: oznaka in deli naslova v isti ravni (FR-016-13). */
export interface AddressSuggestion extends Address {
  label: string;
}
