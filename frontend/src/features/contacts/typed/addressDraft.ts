import type { Address } from '../../attributes/types';
import formats from '../../formats/addressFormats.json';

// Naslov po delih v obrazcu (016, FR-016-12, FR-016-15; research R-04): osnutek ima vse dele kot besedilo, strežnik
// ostane vir resnice za normalizacijo.

export const ADDRESS_PARTS = [
  'street',
  'extra',
  'postalCode',
  'city',
  'region',
  'country',
] as const;
export type AddressPart = (typeof ADDRESS_PARTS)[number];
export type AddressDraft = Record<AddressPart, string>;

export const EMPTY_ADDRESS: AddressDraft = {
  street: '',
  extra: '',
  postalCode: '',
  city: '',
  region: '',
  country: '',
};

/** Meje delov v kodnih točkah (kot strežnik). */
export const ADDRESS_LIMITS: Record<Exclude<AddressPart, 'country'>, number> = {
  street: 200,
  extra: 200,
  postalCode: 20,
  city: 100,
  region: 100,
};

export type AddressErrorKey =
  'address.errors.REQUIRED' | 'address.errors.TOO_LONG' | 'address.errors.INVALID_VALUE';

export function draftOf(address: Address | null | undefined): AddressDraft {
  return {
    street: address?.street ?? '',
    extra: address?.extra ?? '',
    postalCode: address?.postalCode ?? '',
    city: address?.city ?? '',
    region: address?.region ?? '',
    country: address?.country ?? '',
  };
}

const clean = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Osnutek brez vsebine (država sama, ki je predizpolnjena, ne šteje). */
export function isBlankDraft(draft: AddressDraft): boolean {
  return ADDRESS_PARTS.every((part) => part === 'country' || clean(draft[part]) === '');
}

/** Telo zahtevka: obrezani deli s strnjenimi presledki, prazni izpuščeni; prazen osnutek je `null`. */
export function toAddress(draft: AddressDraft): Address | null {
  if (isBlankDraft(draft)) return null;
  const address: Address = {};
  for (const part of ADDRESS_PARTS) {
    const value = clean(draft[part]);
    if (value !== '') address[part] = value;
  }
  return address;
}

/** Napake po delih (kot strežnik): obvezna ulica ali kraj, meje dolžin. Prazen osnutek je veljaven. */
export function validateDraft(draft: AddressDraft): Partial<Record<AddressPart, AddressErrorKey>> {
  const errors: Partial<Record<AddressPart, AddressErrorKey>> = {};
  if (isBlankDraft(draft)) return errors;
  for (const part of Object.keys(ADDRESS_LIMITS) as (keyof typeof ADDRESS_LIMITS)[]) {
    if ([...clean(draft[part])].length > ADDRESS_LIMITS[part])
      errors[part] = 'address.errors.TOO_LONG';
  }
  if (clean(draft.street) === '' && clean(draft.city) === '')
    errors.street = 'address.errors.REQUIRED';
  return errors;
}

/** Oblika naslova države (`fmt` iz libaddressinput; kopija datoteke zaledja). */
export function addressFormat(country: string): string {
  const table = formats.formats as Record<string, string>;
  return table[country] ?? formats.default;
}

/** Ali država v naslovu uporablja regijo (`%S`). */
export function usesRegion(country: string): boolean {
  return addressFormat(country).includes('%S');
}

/** Ali je v državi kraj pred poštno številko (npr. `US`, `GB`). */
export function cityBeforePostalCode(country: string): boolean {
  const format = addressFormat(country);
  return format.indexOf('%C') < format.indexOf('%Z');
}
