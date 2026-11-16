import type { Address } from '../attributes/types';
import type { Candidate, ColumnMapping, ImportSheet, MappingTarget } from './types';

// Preslikava stolpcev Excela na polja kontakta v brskalniku (FR-014-02; research R-04): sprememba preslikave pošlje le
// nov predogled, ne nove datoteke.

export const TARGETS: MappingTarget[] = [
  'FIRST_NAME',
  'LAST_NAME',
  'ADDRESS',
  'ADDRESS_STREET',
  'ADDRESS_EXTRA',
  'ADDRESS_POSTAL_CODE',
  'ADDRESS_CITY',
  'ADDRESS_REGION',
  'EMAIL',
  'PHONE',
  'COUNTRY',
  'COMPANY',
  'TAGS',
  'ATTRIBUTE',
  'SKIP',
];

export type MappingError = 'duplicateTarget' | 'duplicateKey' | 'emptyKey' | 'addressConflict';

/** Cilji, ki sestavijo razčlenjen naslov (016, FR-016-24), in ustrezen del naslova. */
const PART_OF: Partial<Record<MappingTarget, keyof Address>> = {
  ADDRESS_STREET: 'street',
  ADDRESS_EXTRA: 'extra',
  ADDRESS_POSTAL_CODE: 'postalCode',
  ADDRESS_CITY: 'city',
  ADDRESS_REGION: 'region',
};

/** Napaka preslikave po stolpcu: predefinirano polje in ključ atributa sta lahko cilj največ enega stolpca. */
export function mappingErrors(mapping: ColumnMapping[]): Map<number, MappingError> {
  const errors = new Map<number, MappingError>();
  const targets = new Map<MappingTarget, number>();
  const keys = new Map<string, number>();
  for (const item of mapping) {
    if (item.target === 'SKIP') continue;
    if (item.target === 'ATTRIBUTE') {
      const key = (item.key ?? '').trim().toLowerCase();
      if (key === '') {
        errors.set(item.column, 'emptyKey');
      } else if (keys.has(key)) {
        errors.set(item.column, 'duplicateKey');
      } else {
        keys.set(key, item.column);
      }
    } else if (targets.has(item.target)) {
      errors.set(item.column, 'duplicateTarget');
    } else {
      targets.set(item.target, item.column);
    }
  }
  // En stolpec *Naslov* (nerazčlenjen) in deli naslova hkrati se izključujeta.
  const single = targets.get('ADDRESS');
  if (single !== undefined && [...targets.keys()].some((target) => target in PART_OF)) {
    errors.set(single, 'addressConflict');
  }
  return errors;
}

/** Vrstice preglednice → kandidati po preslikavi; prazne celice so `null`, značke se razdelijo pri vejicah. */
export function toCandidates(sheet: ImportSheet, mapping: ColumnMapping[]): Candidate[] {
  return sheet.rows.map((row) => {
    const candidate: Candidate = {
      firstName: null,
      lastName: null,
      address: null,
      email: null,
      phone: null,
      company: null,
      countryText: null,
      attributes: [],
      tags: [],
    };
    const parts: Address = {};
    for (const item of mapping) {
      const value = row.cells[item.column] ?? '';
      if (value.trim() === '') continue;
      switch (item.target) {
        case 'FIRST_NAME':
          candidate.firstName = value;
          break;
        case 'LAST_NAME':
          candidate.lastName = value;
          break;
        case 'ADDRESS':
          candidate.address = value;
          break;
        case 'EMAIL':
          candidate.email = value;
          break;
        case 'PHONE':
          candidate.phone = value;
          break;
        case 'COMPANY':
          candidate.company = value;
          break;
        case 'COUNTRY':
          candidate.countryText = value;
          break;
        case 'TAGS':
          candidate.tags = value
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag !== '');
          break;
        case 'ATTRIBUTE':
          if (item.key && item.key.trim() !== '') {
            candidate.attributes.push({
              key: item.key.trim(),
              ...(item.type ? { type: item.type } : {}),
              value,
            });
          }
          break;
        case 'ADDRESS_STREET':
        case 'ADDRESS_EXTRA':
        case 'ADDRESS_POSTAL_CODE':
        case 'ADDRESS_CITY':
        case 'ADDRESS_REGION': {
          const part = PART_OF[item.target];
          if (part) parts[part] = value.trim();
          break;
        }
        case 'SKIP':
          break;
      }
    }
    if (Object.keys(parts).length > 0) candidate.addressParts = parts;
    return candidate;
  });
}
