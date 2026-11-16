import { useMemo } from 'react';

import type { Address } from '../attributes/types';
import { countryName } from '../contacts/countries';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { useDisplayFormats } from './displayFormatsContext';
import { formatAddress } from './formatAddress';
import { formatDate } from './formatDate';
import { formatPhone } from './formatPhone';

export interface Formatters {
  phone: (value: string) => string;
  date: (value: string) => string;
  /** Razčlenjen naslov po shemi; besedilo dobesedno. `withCountry` doda državo kot zadnjo vrstico. */
  address: (address: Address | string, withCountry?: boolean) => string;
  /** Vrednost predefiniranega polja (`PHONE`, `ADDRESS`) ali tipa atributa; ostalo je dobesedno. */
  byType: (type: string | undefined, value: string) => string;
}

/** Oblikovalniki po izbranih shemah uporabnika in jeziku vmesnika (FR-016-16). */
export function useFormatters(): Formatters {
  const { formats } = useDisplayFormats();
  const language = useUiLanguage();
  return useMemo<Formatters>(() => {
    const phone = (value: string) => formatPhone(value, formats.phoneFormat);
    const date = (value: string) => formatDate(value, formats.dateFormat, language);
    const address = (value: Address | string, withCountry = false) =>
      formatAddress(
        value,
        formats.addressFormat,
        withCountry ? (code) => countryName(code, language) : undefined,
      );
    return {
      phone,
      date,
      address,
      byType: (type, value) => {
        if (type === 'PHONE') return phone(value);
        if (type === 'DATE') return date(value);
        return value;
      },
    };
  }, [formats, language]);
}
