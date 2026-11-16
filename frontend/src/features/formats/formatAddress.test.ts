import { describe, expect, it } from 'vitest';

import { formatAddress } from './formatAddress';

const SI = {
  street: 'Slovenska cesta 1',
  postalCode: '1000',
  city: 'Ljubljana',
  country: 'SI',
};
const US = {
  street: '1 Main St',
  extra: 'Apt 4',
  postalCode: '62701',
  city: 'Springfield',
  region: 'IL',
  country: 'US',
};

describe('formatAddress', () => {
  it('FR-016-16: po pravilih države – slovenski naslov z vrstico »1000 Ljubljana«', () => {
    expect(formatAddress(SI, 'COUNTRY')).toBe('Slovenska cesta 1\n1000 Ljubljana');
    expect(formatAddress(SI, null)).toBe('Slovenska cesta 1\n1000 Ljubljana');
  });

  it('FR-016-16: po pravilih države – ameriški naslov z vrstico »Springfield, IL 62701«', () => {
    expect(formatAddress(US, 'COUNTRY')).toBe('1 Main St\nApt 4\nSpringfield, IL 62701');
  });

  it('FR-016-16: enovrstično', () => {
    expect(formatAddress(SI, 'SINGLE_LINE')).toBe('Slovenska cesta 1, 1000 Ljubljana');
    expect(formatAddress(US, 'SINGLE_LINE')).toBe('1 Main St, Apt 4, Springfield, IL 62701');
  });

  it('FR-016-16: manjkajoča regija ne pusti ločil', () => {
    expect(formatAddress({ ...US, region: undefined }, 'COUNTRY')).toBe(
      '1 Main St\nApt 4\nSpringfield, 62701',
    );
    expect(formatAddress({ street: 'Rua A', city: 'São Paulo', country: 'BR' }, 'COUNTRY')).toBe(
      'Rua A\nSão Paulo',
    );
  });

  it('FR-016-16: država brez pravila ali brez države uporabi privzeti vrstni red', () => {
    expect(
      formatAddress({ street: 'X 1', postalCode: '123', city: 'Y', country: 'ZZ' }, null),
    ).toBe('X 1\n123 Y');
    expect(formatAddress({ city: 'Maribor' }, 'COUNTRY')).toBe('Maribor');
  });

  it('FR-016-16: država kot zadnja vrstica, če je ime podano', () => {
    expect(formatAddress(SI, 'SINGLE_LINE', () => 'Slovenija')).toBe(
      'Slovenska cesta 1, 1000 Ljubljana, Slovenija',
    );
  });

  it('FR-016-16: nerazčlenjen naslov je prikazan dobesedno', () => {
    expect(formatAddress('Neka ulica 5\n1234 Kraj', 'SINGLE_LINE')).toBe('Neka ulica 5\n1234 Kraj');
  });
});
