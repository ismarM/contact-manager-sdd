// Preverjanje kontakta v brskalniku po istih pravilih kot strežnik (research R-06, feature-map §2.6); strežnik ostane
// vir resnice, njegove napake po poljih se prikažejo enako (`serverErrorKey`).

export const LIMITS = {
  name: 100,
  address: 300,
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

export type ErrorKey =
  | 'contacts.errors.nameRequired'
  | 'contacts.errors.emailInvalid'
  | 'contacts.errors.phoneInvalid'
  | 'contacts.errors.firstNameTooLong'
  | 'contacts.errors.lastNameTooLong'
  | 'contacts.errors.addressTooLong'
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
  | 'contacts.errors.tagTooLong';

export interface AttributeRow {
  id: string;
  key: string;
  value: string;
}

export interface FormValues {
  firstName: string;
  lastName: string;
  address: string;
  email: string;
  phone: string;
  attributes: AttributeRow[];
  tags: string[];
}

/** Dolžina v kodnih točkah (kot strežnik). */
export function length(text: string): number {
  return [...text].length;
}

export function normalizeKey(text: string): string {
  return text.toLowerCase();
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
  if (length(values.address.trim()) > LIMITS.address) {
    errors.address = 'contacts.errors.addressTooLong';
  }
  const email = values.email.trim();
  if (length(email) > LIMITS.email) errors.email = 'contacts.errors.emailTooLong';
  else if (email && !EMAIL.test(email)) errors.email = 'contacts.errors.emailInvalid';
  const phone = values.phone.trim();
  if (length(phone) > LIMITS.phone) errors.phone = 'contacts.errors.phoneTooLong';
  else if (phone && !PHONE.test(phone)) errors.phone = 'contacts.errors.phoneInvalid';

  const keys = new Set<string>();
  for (const row of values.attributes) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) continue;
    const keyField = `attributes.${row.id}.key`;
    const valueField = `attributes.${row.id}.value`;
    const normalized = normalizeKey(key);
    if (!key) errors[keyField] = 'contacts.errors.keyRequired';
    else if (length(key) > LIMITS.key) errors[keyField] = 'contacts.errors.keyTooLong';
    else if (RESERVED_KEYS.has(normalized.replace(/\s+/g, ' '))) {
      errors[keyField] = 'contacts.errors.keyReserved';
    } else if (keys.has(normalized)) errors[keyField] = 'contacts.errors.keyDuplicate';
    if (key) keys.add(normalized);
    if (!value) errors[valueField] = 'contacts.errors.valueRequired';
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
  return table[base]?.[code] ?? null;
}
