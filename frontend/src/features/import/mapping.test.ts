import { describe, expect, it } from 'vitest';

import { mappingErrors, toCandidates } from './mapping';
import type { ColumnMapping, ImportSheet } from './types';

const SHEET: ImportSheet = {
  format: 'XLSX',
  sheetCount: 1,
  headers: ['Ime', 'Značke', 'Vloga', 'Prazno'],
  suggestedMapping: [],
  rows: [{ rowNumber: 2, cells: ['Ana', ' a , ,b ', 'mentor', ''] }],
};

describe('preslikava stolpcev (FR-014-02)', () => {
  it('vrstico preslika na polja, značke razdeli pri vejicah, prazne celice izpusti', () => {
    const mapping: ColumnMapping[] = [
      { column: 0, target: 'FIRST_NAME', key: null },
      { column: 1, target: 'TAGS', key: null },
      { column: 2, target: 'ATTRIBUTE', key: ' Vloga ' },
      { column: 3, target: 'ATTRIBUTE', key: 'Prazno' },
    ];

    expect(toCandidates(SHEET, mapping)).toEqual([
      {
        firstName: 'Ana',
        lastName: null,
        address: null,
        email: null,
        phone: null,
        company: null,
        countryText: null,
        attributes: [{ key: 'Vloga', value: 'mentor' }],
        tags: ['a', 'b'],
      },
    ]);
  });

  it('predefinirano polje in ključ atributa sta lahko cilj samo enega stolpca; ključ ne sme biti prazen', () => {
    const errors = mappingErrors([
      { column: 0, target: 'EMAIL', key: null },
      { column: 1, target: 'EMAIL', key: null },
      { column: 2, target: 'ATTRIBUTE', key: 'Vloga' },
      { column: 3, target: 'ATTRIBUTE', key: 'vloga' },
      { column: 4, target: 'ATTRIBUTE', key: ' ' },
      { column: 5, target: 'SKIP', key: null },
      { column: 6, target: 'SKIP', key: null },
    ]);

    expect([...errors.entries()]).toEqual([
      [1, 'duplicateTarget'],
      [3, 'duplicateKey'],
      [4, 'emptyKey'],
    ]);
  });

  it('FR-016-24: deli naslova iz stolpcev sestavijo addressParts, tip novega ključa gre v atribut', () => {
    const sheet: ImportSheet = {
      ...SHEET,
      headers: ['Ulica', 'Pošta', 'Kraj', 'Mobitel'],
      rows: [{ rowNumber: 2, cells: [' Trg 1 ', '1000', 'Ljubljana', '041 123 456'] }],
    };
    const mapping: ColumnMapping[] = [
      { column: 0, target: 'ADDRESS_STREET', key: null },
      { column: 1, target: 'ADDRESS_POSTAL_CODE', key: null },
      { column: 2, target: 'ADDRESS_CITY', key: null },
      { column: 3, target: 'ATTRIBUTE', key: 'Mobitel', type: 'PHONE' },
    ];

    const [candidate] = toCandidates(sheet, mapping);

    expect(candidate?.addressParts).toEqual({
      street: 'Trg 1',
      postalCode: '1000',
      city: 'Ljubljana',
    });
    expect(candidate?.address).toBeNull();
    expect(candidate?.attributes).toEqual([
      { key: 'Mobitel', type: 'PHONE', value: '041 123 456' },
    ]);
  });

  it('FR-016-24: naslov v enem stolpcu in deli naslova se izključujejo', () => {
    const errors = mappingErrors([
      { column: 0, target: 'ADDRESS', key: null },
      { column: 1, target: 'ADDRESS_CITY', key: null },
    ]);

    expect([...errors.entries()]).toEqual([[0, 'addressConflict']]);
  });
});
