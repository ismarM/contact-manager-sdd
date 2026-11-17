import { describe, expect, it } from 'vitest';

import { cityBeforePostalCode, toAddress, usesRegion, validateDraft } from './addressDraft';
import { splitAddress } from './splitAddress';

// Preprosta razčlenitev nerazčlenjenega naslova (FR-016-14; research R-04) in pravila osnutka (FR-016-12, FR-016-15).

describe('splitAddress', () => {
  it('FR-016-14: prva vrstica je ulica, vrstica s poštno številko se razdeli, ostalo gre v dodatno vrstico', () => {
    expect(splitAddress('Slovenska cesta 1\n1000 Ljubljana\nSlovenija', 'SI')).toEqual({
      street: 'Slovenska cesta 1',
      extra: 'Slovenija',
      postalCode: '1000',
      city: 'Ljubljana',
      region: '',
      country: 'SI',
    });
  });

  it('FR-016-14: ena vrstica z vejicami se razdeli po vejicah; presledki in prazne vrstice odpadejo', () => {
    expect(splitAddress('  Glavni trg   5 ,  2000  Maribor ')).toMatchObject({
      street: 'Glavni trg 5',
      postalCode: '2000',
      city: 'Maribor',
      extra: '',
    });
    expect(splitAddress('Ulica 1\r\n\r\nSI-4000 Kranj')).toMatchObject({
      street: 'Ulica 1',
      postalCode: 'SI-4000',
      city: 'Kranj',
    });
  });

  it('FR-016-14: brez poštne vrstice je vse ulica in dodatna vrstica; samo poštna vrstica je kraj', () => {
    expect(splitAddress('Slovenska cesta 1\nVhod B')).toMatchObject({
      street: 'Slovenska cesta 1',
      extra: 'Vhod B',
      postalCode: '',
      city: '',
    });
    expect(splitAddress('1000 Ljubljana')).toMatchObject({
      street: '',
      postalCode: '1000',
      city: 'Ljubljana',
    });
    // Prva vrstica s številko spredaj ostane ulica (npr. ameriški naslov).
    expect(splitAddress('1600 Pennsylvania Avenue\nWashington')).toMatchObject({
      street: '1600 Pennsylvania Avenue',
      extra: 'Washington',
    });
    expect(splitAddress('')).toMatchObject({ street: '', city: '' });
  });
});

describe('osnutek naslova', () => {
  const draft = (parts: Partial<Record<string, string>>) => ({
    street: '',
    extra: '',
    postalCode: '',
    city: '',
    region: '',
    country: '',
    ...parts,
  });

  it('FR-016-12: obvezna ulica ali kraj, meje 200/200/20/100/100 v kodnih točkah; sama država je prazen naslov', () => {
    expect(validateDraft(draft({ postalCode: '1000' }))).toEqual({
      street: 'address.errors.REQUIRED',
    });
    expect(validateDraft(draft({ country: 'SI' }))).toEqual({});
    expect(toAddress(draft({ country: 'SI' }))).toBeNull();
    expect(
      validateDraft(
        draft({ street: 'č'.repeat(200), city: 'k'.repeat(100), postalCode: '1'.repeat(20) }),
      ),
    ).toEqual({});
    expect(
      validateDraft(
        draft({
          street: 'č'.repeat(201),
          extra: 'e'.repeat(201),
          city: 'k'.repeat(101),
          region: 'r'.repeat(101),
          postalCode: '1'.repeat(21),
        }),
      ),
    ).toEqual({
      street: 'address.errors.TOO_LONG',
      extra: 'address.errors.TOO_LONG',
      postalCode: 'address.errors.TOO_LONG',
      city: 'address.errors.TOO_LONG',
      region: 'address.errors.TOO_LONG',
    });
  });

  it('FR-016-15: telo zahtevka ima obrezane dele s strnjenimi presledki, prazni deli so izpuščeni', () => {
    expect(
      toAddress(draft({ street: '  Ulica   1 ', city: 'Kraj', extra: '  ', country: 'SI' })),
    ).toEqual({
      street: 'Ulica 1',
      city: 'Kraj',
      country: 'SI',
    });
  });

  it('FR-016-12: polja po državi – regija in vrstni red kraja ter poštne številke', () => {
    expect(usesRegion('US')).toBe(true);
    expect(usesRegion('SI')).toBe(false);
    expect(cityBeforePostalCode('US')).toBe(true);
    expect(cityBeforePostalCode('SI')).toBe(false);
    expect(cityBeforePostalCode('')).toBe(false);
  });
});
