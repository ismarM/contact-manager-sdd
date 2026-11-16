import { describe, expect, it } from 'vitest';

import { comparison, entryId, stateView, version } from '../../test/historyApi';
import { buildRows } from './compareRows';

// Vrstice primerjave (FR-015-09): značke posamično, atributi dodani/odstranjeni, nespremenjena polja iz stanj.

describe('buildRows', () => {
  it('spremenjena polja: telefon spremenjen, atribut dodan/odstranjen, značke posamično', () => {
    const { changed } = buildRows(
      comparison({
        changes: [
          { field: 'PHONE', key: null, before: '1', after: '2' },
          { field: 'ATTRIBUTE', key: 'a', before: null, after: 'x' },
          { field: 'ATTRIBUTE', key: 'b', before: 'y', after: null },
          { field: 'ATTRIBUTE', key: 'c', before: 'y', after: 'z' },
          { field: 'TAGS', key: null, before: ['vip', 'skupna'], after: ['skupna', 'nova'] },
        ],
      }),
    );

    expect(changed.map((row) => [row.id, row.kind])).toEqual([
      ['field:PHONE', 'CHANGED'],
      ['attribute:a', 'ADDED'],
      ['attribute:b', 'REMOVED'],
      ['attribute:c', 'CHANGED'],
      ['tag:vip', 'REMOVED'],
      ['tag:nova', 'ADDED'],
    ]);
  });

  it('osnovna polja so vedno spremenjena, tudi iz praznega v vrednost', () => {
    const { changed } = buildRows(
      comparison({ changes: [{ field: 'COMPANY', key: null, before: null, after: 'Firma' }] }),
    );

    expect(changed[0]?.kind).toBe('CHANGED');
  });

  it('nespremenjena polja: samo izpolnjena in brez spremenjenih; značke in atributi posamično', () => {
    const { changed, unchanged } = buildRows(
      comparison({
        from: version(entryId(1)),
        to: version('current', {
          state: stateView({
            phone: '2',
            company: null,
            attributes: [
              { key: 'a', value: 'x' },
              { key: 'k', value: 'v' },
            ],
            tags: ['skupna'],
          }),
        }),
        changes: [
          { field: 'PHONE', key: null, before: '1', after: '2' },
          { field: 'ATTRIBUTE', key: 'a', before: null, after: 'x' },
        ],
      }),
    );

    expect(changed.map((row) => row.id)).toEqual(['field:PHONE', 'attribute:a']);
    expect(unchanged.map((row) => row.id)).toEqual([
      'field:FIRST_NAME',
      'field:LAST_NAME',
      'field:EMAIL',
      'attribute:k',
      'tag:skupna',
    ]);
    expect(unchanged.every((row) => row.kind === 'UNCHANGED')).toBe(true);
  });
});
