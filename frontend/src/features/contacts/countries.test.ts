import { describe, expect, it } from 'vitest';

import {
  allCountries,
  COUNTRY_CODES,
  countryName,
  isCountryCode,
  searchCountries,
} from './countries';

describe('countries (FR-013-13, FR-013-17)', () => {
  it('ima 249 uradnih kod ISO 3166-1 alpha-2, brez XK in brez podvojenih', () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    expect(isCountryCode('SI')).toBe(true);
    expect(isCountryCode('XK')).toBe(false);
    expect(isCountryCode('si')).toBe(false);
  });

  it('ima za vsako kodo ime v sl in en', () => {
    for (const code of COUNTRY_CODES) {
      expect(countryName(code, 'sl')).not.toBe(code);
      expect(countryName(code, 'en')).not.toBe(code);
    }
    expect(countryName('AT', 'sl')).toBe('Avstrija');
    expect(countryName('AT', 'en')).toBe('Austria');
  });

  it('neznana koda ostane surova koda', () => {
    expect(countryName('XX', 'sl')).toBe('XX');
  });

  it('razvršča po abecedi jezika vmesnika', () => {
    const names = allCountries('sl').map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'sl')));
  });

  it('išče po imenu brez razlike velikosti črk in strešic ter po kodi', () => {
    expect(searchCountries('avs', 'sl').map((c) => c.code)).toContain('AT');
    expect(searchCountries('AVSTRI', 'sl')[0]?.code).toBe('AT');
    expect(searchCountries('at', 'sl')[0]?.code).toBe('AT');
    expect(searchCountries('ceska', 'sl').map((c) => c.code)).toContain('CZ');
    expect(searchCountries('austria', 'en')[0]?.code).toBe('AT');
    expect(searchCountries('zzzz', 'sl')).toEqual([]);
    expect(searchCountries('', 'sl')).toHaveLength(249);
  });
});
