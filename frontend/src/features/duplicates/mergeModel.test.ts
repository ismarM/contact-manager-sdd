import { describe, expect, it } from 'vitest';

import { compareContact } from '../../test/duplicatesApi';
import {
  buildResult,
  buildRows,
  canExclude,
  defaultChoices,
  excludeContact,
  keptContact,
  toggleTag,
  validateResult,
} from './mergeModel';
import type { MergeResultInput } from './types';

// Čisti model tabele razlik (specs/011-dvojniki/research.md R-12; FR-011-09 … FR-011-13, FR-011-21).

const A = compareContact({ n: 1, firstName: 'Janez', lastName: 'Novak', phone: null });
const B = compareContact({ n: 2, firstName: 'Janez', lastName: 'Novak', phone: '041 111 222' });
const C = compareContact({ n: 3, firstName: 'Janez', lastName: 'Novak', phone: '041 333 444' });

const sorted = (values: string[]) => [...values].sort();

function emptyResult(overrides: Partial<MergeResultInput> = {}): MergeResultInput {
  return {
    firstName: 'Janez',
    lastName: 'Novak',
    address: null,
    email: null,
    phone: null,
    attributes: [],
    tags: [],
    ...overrides,
  };
}

describe('mergeModel – vrstice in privzete izbire', () => {
  it('FR-011-09: vrstica »Telefon« ima možnosti (prazno), 041 111 222, 041 333 444 in privzeto prvo neprazno', () => {
    const phone = buildRows([A, B, C]).rows.find((row) => row.key === 'phone');

    expect(phone?.kind).toBe('field');
    expect(phone?.options.map((option) => option.value)).toEqual([
      null,
      '041 111 222',
      '041 333 444',
    ]);
    expect(phone?.options.map((option) => option.contactIds)).toEqual([[A.id], [B.id], [C.id]]);
    expect(defaultChoices([A, B, C]).values.phone).toBe('041 111 222');
  });

  it('FR-011-09: privzeta vrednost je vrednost prvega kontakta, če ni prazna', () => {
    const first = compareContact({
      n: 1,
      firstName: 'Janez',
      lastName: 'Novak',
      phone: '041 000 000',
    });

    expect(defaultChoices([first, B, C]).values.phone).toBe('041 000 000');
  });

  it('FR-011-09: vrstici z enako vrednostjo (priimek, e-naslov) sta med enakimi in nista izbirni', () => {
    const first = compareContact({
      n: 1,
      firstName: 'Janez',
      lastName: 'Novak',
      email: 'janez@primer.si',
      address: 'Cesta 1',
      phone: '041 111 222',
    });
    const second = compareContact({
      n: 2,
      firstName: 'Ana',
      lastName: 'Novak',
      email: 'janez@primer.si',
      address: null,
      phone: '041 333 444',
    });

    const { rows, identical } = buildRows([first, second]);

    expect(identical.map((row) => row.key)).toEqual(['lastName', 'email']);
    expect(identical).toHaveLength(2);
    expect(rows.map((row) => row.key)).toEqual(['firstName', 'address', 'phone']);
    expect(rows.map((row) => row.key)).not.toContain('lastName');
  });

  it('FR-011-09: vrstica z enakimi praznimi vrednostmi (naslov) je med enakimi, ni izbirna in v rezultatu je null', () => {
    const first = compareContact({
      n: 1,
      firstName: 'Janez',
      lastName: 'Novak',
      email: 'janez@primer.si',
      address: null,
      phone: '041 111 222',
    });
    const second = compareContact({
      n: 2,
      firstName: 'Ana',
      lastName: 'Novak',
      email: 'janez@primer.si',
      address: null,
      phone: '041 333 444',
    });

    const { rows, identical } = buildRows([first, second]);

    expect(identical.map((row) => row.key).sort()).toEqual(['address', 'email', 'lastName']);
    expect(identical).toHaveLength(3);
    expect(rows.map((row) => row.key)).not.toContain('address');
    expect(buildResult([first, second], defaultChoices([first, second])).address).toBeNull();
  });
});

describe('mergeModel – dodatni atributi', () => {
  const withAttr = (n: number, key: string, value: string) =>
    compareContact({ n, attributes: [{ key, value }] });

  it('FR-011-09: Kompetenca in kompetenca sta ena vrstica z možnostma web dev in java', () => {
    const contacts = [withAttr(1, 'Kompetenca', 'web dev'), withAttr(2, 'kompetenca', 'java')];

    const attributeRows = buildRows(contacts).rows.filter((row) => row.kind === 'attribute');

    expect(attributeRows).toHaveLength(1);
    expect(attributeRows[0]?.key).toBe('attr:kompetenca');
    expect(attributeRows[0]?.label).toBe('Kompetenca');
    expect(attributeRows[0]?.options.map((option) => option.value)).toEqual(['web dev', 'java']);
  });

  it('FR-011-09: privzeto je prva vrednost, izbira java da v rezultatu ključ iz kontakta izbrane vrednosti', () => {
    const contacts = [withAttr(1, 'Kompetenca', 'web dev'), withAttr(2, 'kompetenca', 'java')];
    const selection = defaultChoices(contacts);

    expect(buildResult(contacts, selection).attributes).toEqual([
      { key: 'Kompetenca', value: 'web dev' },
    ]);

    const chosen = {
      ...selection,
      values: { ...selection.values, 'attr:kompetenca': 'java' },
    };
    expect(buildResult(contacts, chosen).attributes).toEqual([
      { key: 'kompetenca', value: 'java' },
    ]);
  });

  it('FR-011-09: izbira (prazno) za atribut pomeni, da v rezultatu atributa ni', () => {
    const contacts = [withAttr(1, 'Kompetenca', 'web dev'), compareContact({ n: 2 })];
    const selection = defaultChoices(contacts);
    const row = buildRows(contacts).rows.find((r) => r.key === 'attr:kompetenca');
    expect(row?.options.map((option) => option.value)).toEqual(['web dev', null]);

    const empty = { ...selection, values: { ...selection.values, 'attr:kompetenca': null } };

    expect(buildResult(contacts, empty).attributes).toEqual([]);
  });
});

describe('mergeModel – značke', () => {
  const tagged = [
    compareContact({ n: 1, tags: ['vip', 'konferenca2025'] }),
    compareContact({ n: 2, tags: ['VIP', 'alumni'] }),
  ];

  it('FR-011-10: unija značk brez razlike velikosti črk, zapis prvega kontakta, vse privzeto obkljukane', () => {
    expect(buildRows(tagged).tags).toEqual(['vip', 'konferenca2025', 'alumni']);
    expect(sorted(defaultChoices(tagged).tags)).toEqual(
      sorted(['vip', 'konferenca2025', 'alumni']),
    );
    expect(sorted(buildResult(tagged, defaultChoices(tagged)).tags)).toEqual(
      sorted(['vip', 'konferenca2025', 'alumni']),
    );
  });

  it('FR-011-10: toggleTag odkljuka obkljukano in ponovno obkljuka odkljukano značko', () => {
    const selection = defaultChoices(tagged);

    const off = toggleTag(selection, 'vip');
    expect(sorted(off.tags)).toEqual(sorted(['konferenca2025', 'alumni']));
    expect(sorted(buildResult(tagged, off).tags)).toEqual(sorted(['konferenca2025', 'alumni']));
    expect(sorted(selection.tags)).toEqual(sorted(['vip', 'konferenca2025', 'alumni']));

    const on = toggleTag(off, 'vip');
    expect(sorted(on.tags)).toEqual(sorted(['vip', 'konferenca2025', 'alumni']));
  });
});

describe('mergeModel – izločitev in ohranjeni kontakt', () => {
  it('FR-011-11: izločitev C vrne izbire, ki so kazale na vrednost C, na privzete', () => {
    const selection = defaultChoices([A, B, C]);
    const chosen = { ...selection, values: { ...selection.values, phone: '041 333 444' } };

    const result = excludeContact([A, B, C], chosen, C.id);

    expect(result.contacts.map((contact) => contact.id)).toEqual([A.id, B.id]);
    expect(result.selection.values.phone).toBe('041 111 222');
  });

  it('FR-011-11: izločitev ne spremeni izbir, ki ne kažejo na izločeni kontakt', () => {
    const selection = defaultChoices([A, B, C]);
    const chosen = { ...selection, values: { ...selection.values, phone: '041 111 222' } };

    const result = excludeContact([A, B, C], chosen, C.id);

    expect(result.selection.values.phone).toBe('041 111 222');
  });

  it('FR-011-11: canExclude je resničen pri 3 kontaktih in neresničen, ko ostaneta 2', () => {
    expect(canExclude([A, B, C])).toBe(true);
    expect(canExclude([A, B])).toBe(false);
  });

  it('FR-011-11: ohranjeni je prvi kontakt, po izločitvi A pa B', () => {
    expect(keptContact([A, B, C]).id).toBe(A.id);

    const { contacts } = excludeContact([A, B, C], defaultChoices([A, B, C]), A.id);

    expect(contacts.map((contact) => contact.id)).toEqual([B.id, C.id]);
    expect(keptContact(contacts).id).toBe(B.id);
  });
});

describe('mergeModel – rezultat in predogled', () => {
  it('FR-011-12: buildResult vrne result točno po izbirah', () => {
    const contacts = [
      compareContact({
        n: 1,
        firstName: 'Janez',
        lastName: 'Novak',
        address: 'Cesta 1',
        email: 'janez@primer.si',
        phone: null,
        attributes: [{ key: 'Kompetenca', value: 'web dev' }],
        tags: ['vip'],
      }),
      compareContact({
        n: 2,
        firstName: 'Ana',
        lastName: 'Novak',
        address: null,
        email: 'janez@primer.si',
        phone: '041 111 222',
        attributes: [{ key: 'kompetenca', value: 'java' }],
        tags: ['VIP', 'alumni'],
      }),
    ];
    const selection = defaultChoices(contacts);
    const chosen = toggleTag(
      {
        ...selection,
        values: {
          ...selection.values,
          firstName: 'Ana',
          address: null,
          'attr:kompetenca': 'java',
        },
      },
      'alumni',
    );

    const result = buildResult(contacts, chosen);

    expect(result).toEqual({
      firstName: 'Ana',
      lastName: 'Novak',
      address: null,
      email: 'janez@primer.si',
      phone: '041 111 222',
      attributes: [{ key: 'kompetenca', value: 'java' }],
      tags: ['vip'],
    });
  });
});

describe('mergeModel – validateResult', () => {
  it('FR-011-13: veljaven rezultat je brez napak', () => {
    expect(validateResult(emptyResult())).toEqual([]);
    expect(validateResult(emptyResult({ firstName: null }))).toEqual([]);
    expect(validateResult(emptyResult({ lastName: null }))).toEqual([]);
  });

  it('FR-011-13: ime in priimek (prazno) dasta napako firstName/lastName z REQUIRED', () => {
    const errors = validateResult(emptyResult({ firstName: null, lastName: null }));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((error) => error.code)).toEqual(errors.map(() => 'REQUIRED'));
    expect(errors.map((error) => error.field)).toContain('firstName');
    expect(errors.every((error) => error.field === 'firstName' || error.field === 'lastName')).toBe(
      true,
    );
  });

  it('FR-011-13: unija 32 značk da napako tags z excess 2, 30 značk je še veljavnih', () => {
    const tags = (count: number) => Array.from({ length: count }, (_, i) => `znacka${i}`);

    expect(validateResult(emptyResult({ tags: tags(30) }))).toEqual([]);
    expect(validateResult(emptyResult({ tags: tags(32) }))).toEqual([
      { field: 'tags', code: 'TOO_MANY', excess: 2 },
    ]);
  });

  it('FR-011-13: 51 atributov da napako attributes z excess 1, 50 je še veljavnih', () => {
    const attributes = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ key: `kljuc${i}`, value: 'x' }));

    expect(validateResult(emptyResult({ attributes: attributes(50) }))).toEqual([]);
    expect(validateResult(emptyResult({ attributes: attributes(51) }))).toEqual([
      { field: 'attributes', code: 'TOO_MANY', excess: 1 },
    ]);
  });
});
