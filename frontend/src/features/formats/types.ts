// Prikazne sheme (016, FR-016-16): spremenijo samo prikaz v brskalniku; strežnik hrani kanonično obliko.

export const PHONE_FORMATS = ['INTERNATIONAL', 'NATIONAL', 'E164'] as const;
export const DATE_FORMATS = ['LOCALE', 'ISO', 'LONG'] as const;
export const ADDRESS_FORMATS = ['COUNTRY', 'SINGLE_LINE'] as const;

export type PhoneFormat = (typeof PHONE_FORMATS)[number];
export type DateFormat = (typeof DATE_FORMATS)[number];
export type AddressFormat = (typeof ADDRESS_FORMATS)[number];

/** Izbrane sheme; `null` = privzeta (*Mednarodno*, *Po jeziku vmesnika*, *Po pravilih države*). */
export interface DisplayFormats {
  phoneFormat: PhoneFormat | null;
  dateFormat: DateFormat | null;
  addressFormat: AddressFormat | null;
}

export const DEFAULT_FORMATS: DisplayFormats = {
  phoneFormat: null,
  dateFormat: null,
  addressFormat: null,
};

export type UiLanguage = 'sl' | 'en';
