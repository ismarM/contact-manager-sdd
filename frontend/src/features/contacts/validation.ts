// Preverjanje kontakta v brskalniku po istih pravilih kot strežnik (research R-06, feature-map §2.6); strežnik ostane
// vir resnice, njegove napake po poljih se prikažejo enako (`serverErrorKey`).

import type { AttributeType } from '../attributes/types';
import {
  ADDRESS_PARTS,
  type AddressDraft,
  type AddressErrorKey,
  isBlankDraft,
  validateDraft,
} from './typed/addressDraft';

export const LIMITS = {
  name: 100,
  address: 300,
  company: 200,
  email: 254,
  phone: 30,
  key: 50,
  value: 500,
  tag: 50,
  attributes: 50,
  tags: 30,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-()/ ]+$/;

const RESERVED_KEYS = new Set([
  'ime',
  'first name',
  'priimek',
  'last name',
  'naslov',
  'address',
  'e-naslov',
  'email',
  'e-mail',
  'telefon',
  'phone',
]);

/** 013: nova rezervirana imena; veljajo samo za nove ali spremenjene ključe (FR-013-08). */
const FIELD_KEYS: Record<string, 'company' | 'country'> = {
  podjetje: 'company',
  company: 'company',
  država: 'country',
  country: 'country',
};

function collapse(text: string): string {
  return normalizeKey(text.trim()).replace(/\s+/g, ' ');
}

/** Ime predefiniranega polja ali polja 013 (ne ponudi se kot predlog ključa, strežnik ga zavrne). */
export function isReservedName(key: string): boolean {
  return RESERVED_KEYS.has(collapse(key)) || reservedFieldOf(key) !== null;
}

/** Polje, v katerega sodi atribut s tem ključem (`Država`, `Country`, `Podjetje`, `Company`), sicer `null`. */
export function reservedFieldOf(key: string): 'company' | 'country' | null {
  return FIELD_KEYS[collapse(key)] ?? null;
}

export type ErrorKey =
  | 'contacts.errors.nameRequired'
  | 'contacts.errors.emailInvalid'
  | 'contacts.errors.phoneInvalid'
  | 'contacts.errors.firstNameTooLong'
  | 'contacts.errors.lastNameTooLong'
  | 'contacts.errors.addressTooLong'
  | 'contacts.errors.companyTooLong'
  | 'contacts.errors.countryInvalid'
  | 'contacts.errors.keyReservedCompany'
  | 'contacts.errors.keyReservedCountry'
  | 'contacts.errors.emailTooLong'
  | 'contacts.errors.phoneTooLong'
  | 'contacts.errors.keyRequired'
  | 'contacts.errors.valueRequired'
  | 'contacts.errors.keyTooLong'
  | 'contacts.errors.valueTooLong'
  | 'contacts.errors.keyDuplicate'
  | 'contacts.errors.keyReserved'
  | 'contacts.errors.tooManyAttributes'
  | 'contacts.errors.tagSpaces'
  | 'contacts.errors.tagDuplicate'
  | 'contacts.errors.tooManyTags'
  | 'contacts.errors.tagTooLong'
  | 'attributes.type.mismatch'
  | AddressErrorKey
  | `typedValue.errors.INVALID_VALUE.${AttributeType}`;

export interface AttributeRow {
  id: string;
  key: string;
  value: string;
  /** 013: ključ, kot ga je kontakt že imel ob nalaganju (obstoječ atribut); novi atributi ga nimajo. */
  original?: string;
  /** 016: tip ključa (manjkajoč = `OTHER`). */
  type?: AttributeType;
  /** 016: tip je tip ključa, ki ga skupina že ima (ne izbira se); nov ključ ima izbiro tipa. */
  typeLocked?: boolean;
  /** 016: deli naslova (tip `ADDRESS`); brez njih je naslov nerazčlenjeno besedilo v `value` (iz časa pred 016). */
  parts?: AddressDraft | null;
}

export interface FormValues {
  firstName: string;
  lastName: string;
  company: string;
  /** Nerazčlenjen naslov iz časa pred 016 (samo za branje, dokler ga uporabnik ne razčleni). */
  address: string;
  /** 016: naslov po delih; `null` = kontakt ima nerazčlenjen naslov (`address`). */
  addressParts: AddressDraft | null;
  country: string;
  email: string;
  phone: string;
  attributes: AttributeRow[];
  tags: string[];
}

/** Vrstica atributa z naslovom po delih. */
export function hasParts(row: AttributeRow): row is AttributeRow & { parts: AddressDraft } {
  return row.parts !== undefined && row.parts !== null;
}

/** Dolžina v kodnih točkah (kot strežnik). */
export function length(text: string): number {
  return [...text].length;
}

export function normalizeKey(text: string): string {
  return text.toLowerCase();
}

/** Sporočilo za ključ z rezerviranim imenom polja (napoti na polje *Podjetje* oziroma *Država*), sicer splošno. */
export function reservedKeyError(key: string): ErrorKey {
  const field = reservedFieldOf(key);
  if (field === 'company') return 'contacts.errors.keyReservedCompany';
  if (field === 'country') return 'contacts.errors.keyReservedCountry';
  return 'contacts.errors.keyReserved';
}

/** Napake po poljih: `firstName`, `attributes.<id>.key`, … → ključ sporočila. */
export function validate(values: FormValues): Record<string, ErrorKey> {
  const errors: Record<string, ErrorKey> = {};
  const first = values.firstName.trim();
  const last = values.lastName.trim();
  if (!first && !last) {
    errors.firstName = 'contacts.errors.nameRequired';
    errors.lastName = 'contacts.errors.nameRequired';
  }
  if (length(first) > LIMITS.name) errors.firstName = 'contacts.errors.firstNameTooLong';
  if (length(last) > LIMITS.name) errors.lastName = 'contacts.errors.lastNameTooLong';
  if (length(values.company.trim()) > LIMITS.company) {
    errors.company = 'contacts.errors.companyTooLong';
  }
  if (values.addressParts === null && length(values.address.trim()) > LIMITS.address) {
    errors.address = 'contacts.errors.addressTooLong';
  }
  if (values.addressParts !== null) {
    for (const [part, error] of Object.entries(validateDraft(values.addressParts))) {
      errors[`addressParts.${part}`] = error;
    }
  }
  const email = values.email.trim();
  if (length(email) > LIMITS.email) errors.email = 'contacts.errors.emailTooLong';
  else if (email && !EMAIL.test(email)) errors.email = 'contacts.errors.emailInvalid';
  const phone = values.phone.trim();
  if (length(phone) > LIMITS.phone) errors.phone = 'contacts.errors.phoneTooLong';
  else if (phone && !PHONE.test(phone)) errors.phone = 'contacts.errors.phoneInvalid';

  const keys = new Set<string>();
  // Ključ, ki ga kontakt že ima (obstoječ atribut), ostane dovoljen tudi, če je rezerviran (strežnik ga ne zavrne).
  const existing = new Set(
    values.attributes.flatMap((row) =>
      row.original === undefined ? [] : [collapse(row.original)],
    ),
  );
  for (const row of values.attributes) {
    const key = row.key.trim();
    const value = row.value.trim();
    const parted = hasParts(row);
    if (!key && !value && (!parted || isBlankDraft(row.parts))) continue;
    const keyField = `attributes.${row.id}.key`;
    const valueField = `attributes.${row.id}.value`;
    const normalized = normalizeKey(key);
    if (!key) errors[keyField] = 'contacts.errors.keyRequired';
    else if (length(key) > LIMITS.key) errors[keyField] = 'contacts.errors.keyTooLong';
    else if (RESERVED_KEYS.has(normalized.replace(/\s+/g, ' '))) {
      errors[keyField] = 'contacts.errors.keyReserved';
    } else if (reservedFieldOf(key) !== null && !existing.has(collapse(key))) {
      errors[keyField] = reservedKeyError(key);
    } else if (keys.has(normalized)) errors[keyField] = 'contacts.errors.keyDuplicate';
    if (key) keys.add(normalized);
    if (parted) {
      const partErrors = validateDraft(row.parts);
      if (isBlankDraft(row.parts)) partErrors.street = 'address.errors.REQUIRED';
      for (const part of ADDRESS_PARTS) {
        const error = partErrors[part];
        if (error) errors[`attributes.${row.id}.parts.${part}`] = error;
      }
    } else if (!value) errors[valueField] = 'contacts.errors.valueRequired';
    else if (length(value) > LIMITS.value) errors[valueField] = 'contacts.errors.valueTooLong';
  }
  return errors;
}

/** Napaka značke pred dodajanjem (FR-004-02); `null`, če je značka sprejemljiva. */
export function tagError(tag: string, tags: string[]): ErrorKey | null {
  if (/\s/.test(tag)) return 'contacts.errors.tagSpaces';
  if (length(tag) > LIMITS.tag) return 'contacts.errors.tagTooLong';
  if (tags.some((existing) => normalizeKey(existing) === normalizeKey(tag))) {
    return 'contacts.errors.tagDuplicate';
  }
  if (tags.length >= LIMITS.tags) return 'contacts.errors.tooManyTags';
  return null;
}

/** Ključ sporočila za napako strežnika (`field` iz `400 VALIDATION_FAILED`, brez indeksa). */
export function serverErrorKey(field: string, code: string): ErrorKey | null {
  const base = field.replace(/\[\d+\]/, '[]');
  const table: Record<string, Record<string, ErrorKey>> = {
    firstName: {
      REQUIRED: 'contacts.errors.nameRequired',
      TOO_LONG: 'contacts.errors.firstNameTooLong',
    },
    lastName: {
      REQUIRED: 'contacts.errors.nameRequired',
      TOO_LONG: 'contacts.errors.lastNameTooLong',
    },
    company: { TOO_LONG: 'contacts.errors.companyTooLong' },
    country: { INVALID_VALUE: 'contacts.errors.countryInvalid' },
    address: { TOO_LONG: 'contacts.errors.addressTooLong' },
    email: {
      INVALID_VALUE: 'contacts.errors.emailInvalid',
      TOO_LONG: 'contacts.errors.emailTooLong',
    },
    phone: {
      INVALID_VALUE: 'contacts.errors.phoneInvalid',
      TOO_LONG: 'contacts.errors.phoneTooLong',
    },
    attributes: { TOO_MANY: 'contacts.errors.tooManyAttributes' },
    'attributes[].key': {
      REQUIRED: 'contacts.errors.keyRequired',
      TOO_LONG: 'contacts.errors.keyTooLong',
      DUPLICATE: 'contacts.errors.keyDuplicate',
      RESERVED_KEY: 'contacts.errors.keyReserved',
    },
    'attributes[].value': {
      REQUIRED: 'contacts.errors.valueRequired',
      TOO_LONG: 'contacts.errors.valueTooLong',
    },
    tags: { TOO_MANY: 'contacts.errors.tooManyTags' },
    'tags[]': {
      INVALID_VALUE: 'contacts.errors.tagSpaces',
      DUPLICATE: 'contacts.errors.tagDuplicate',
      TOO_LONG: 'contacts.errors.tagTooLong',
    },
  };
  const part =
    /^(?:addressParts|attributes\[\]\.parts)\.(street|extra|postalCode|city|region|country)$/.exec(
      base,
    );
  if (part) {
    if (code === 'REQUIRED' || code === 'TOO_LONG') return `address.errors.${code}`;
    if (code === 'INVALID_VALUE') {
      return part[1] === 'country'
        ? 'contacts.errors.countryInvalid'
        : 'address.errors.INVALID_VALUE';
    }
    return null;
  }
  return table[base]?.[code] ?? null;
}
