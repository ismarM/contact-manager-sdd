import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import {
  type ContactQuery,
  countFilters,
  defaultQuery,
  describeFilter,
  parseQuery,
  serializeQuery,
  toApiParams,
  withChange,
} from './contactQuery';

// Poizvedba seznama v naslovu strani (specs/008-iskanje/data-model.md, research.md R-07, R-09). Pričakovanja so
// dobesedna; zapis v naslovu se primerja po parih ime/vrednost, ne po načinu kodiranja.

function pairs(serialized: string): [string, string][] {
  return [...new URLSearchParams(serialized.replace(/^\?/, '')).entries()];
}

function parse(search: string): ContactQuery {
  return parseQuery(new URLSearchParams(search));
}

function query(overrides: Partial<ContactQuery> = {}): ContactQuery {
  return { ...defaultQuery(), ...overrides };
}

describe('contactQuery', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-008-09: privzeta poizvedba se ne zapiše v naslov', () => {
    expect(serializeQuery(query())).toBe('');
    expect(serializeQuery(parse('sort=lastName&dir=asc&page=1&size=25'))).toBe('');
  });

  it('FR-008-09: zapis se začne z ? in ima kanoničen vrstni red q, f, tag, sort, dir, size, page', () => {
    const full = query({
      q: 'novak',
      conditions: [
        { field: 'email', value: 'feri.si' },
        { field: { attribute: 'kompetenca' }, value: 'web' },
      ],
      tags: ['vip', 'konferenca2025'],
      sort: 'email',
      dir: 'desc',
      size: 50,
      page: 3,
    });

    const serialized = serializeQuery(full);

    expect(serialized.startsWith('?')).toBe(true);
    expect(pairs(serialized)).toEqual([
      ['q', 'novak'],
      ['f', 'email:feri.si'],
      ['f', 'x.kompetenca:web'],
      ['tag', 'vip'],
      ['tag', 'konferenca2025'],
      ['sort', 'email'],
      ['dir', 'desc'],
      ['size', '50'],
      ['page', '3'],
    ]);
  });

  it('FR-008-09: isto stanje ima isti naslov ne glede na vrstni red parametrov na vhodu', () => {
    const mixed = parse(
      'page=3&tag=vip&size=50&q=novak&dir=desc&sort=email&f=email%3Aferi.si&tag=konferenca2025',
    );

    expect(pairs(serializeQuery(mixed))).toEqual([
      ['q', 'novak'],
      ['f', 'email:feri.si'],
      ['tag', 'vip'],
      ['tag', 'konferenca2025'],
      ['sort', 'email'],
      ['dir', 'desc'],
      ['size', '50'],
      ['page', '3'],
    ]);
  });

  it('FR-008-03 FR-008-09: ključ z dvopičjem in odstotkom je v naslovu ubežan (%3A, %25)', () => {
    const colon = query({ conditions: [{ field: { attribute: 'a:b' }, value: 'v' }] });
    const percent = query({ conditions: [{ field: { attribute: 'a%b' }, value: 'v' }] });

    expect(pairs(serializeQuery(colon))).toEqual([['f', 'x.a%3Ab:v']]);
    expect(pairs(serializeQuery(percent))).toEqual([['f', 'x.a%25b:v']]);
    expect(parse('f=x.a%253Ab%3Av').conditions).toEqual([
      { field: { attribute: 'a:b' }, value: 'v' },
    ]);
    expect(parse(`f=${encodeURIComponent('x.a%25b:v')}`).conditions).toEqual([
      { field: { attribute: 'a%b' }, value: 'v' },
    ]);
  });

  it('FR-008-03 FR-008-09: vrednosti s posebnimi znaki preživijo krožno pretvorbo', () => {
    const original = query({
      q: 'novak & kralj #1 +100% (a:b)',
      conditions: [
        { field: 'address', value: 'Cesta 5: "Ljubljana" & okolica' },
        { field: { attribute: 'Ključ s presledkom + č' }, value: '100% ž:č' },
      ],
      tags: ['konferenca-2025', 'čaj'],
      sort: { attribute: 'a:b' },
      dir: 'desc',
      size: 100,
      page: 2,
    });

    const back = parse(serializeQuery(original).slice(1));

    expect(back).toEqual(original);
  });

  it('FR-008-09: neveljavne vrednosti v naslovu postanejo privzete, neznani parametri se prezrejo', () => {
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=abc').page).toBe(1);
    expect(parse('page=-2').page).toBe(1);
    expect(parse('size=7').size).toBe(25);
    expect(parse('size=abc').size).toBe(25);
    expect(parse('sort=foo').sort).toBe('lastName');
    expect(parse('dir=up').dir).toBe('asc');
    expect(parse('foo=bar&utm_source=x&q=a')).toEqual(query({ q: 'a' }));
  });

  it('FR-008-03 FR-008-04: razčlenitev okleste na največ 10 pogojev in 30 značk', () => {
    const conditions = Array.from({ length: 12 }, (_, i) => `f=email:v${i}`).join('&');
    const tags = Array.from({ length: 35 }, (_, i) => `tag=t${i}`).join('&');

    const parsed = parse(`${conditions}&${tags}`);

    expect(parsed.conditions).toHaveLength(10);
    expect(parsed.conditions[9]).toEqual({ field: 'email', value: 'v9' });
    expect(parsed.tags).toHaveLength(30);
    expect(parsed.tags[29]).toBe('t29');
  });

  it('FR-008-04: podvojene značke se združijo, ohrani se prva oblika', () => {
    expect(parse('tag=Vip&tag=vip&tag=VIP&tag=konferenca').tags).toEqual(['Vip', 'konferenca']);
  });

  it('FR-008-08: za API je stran 0-osna, velikost in poizvedba se prenesejo', () => {
    const params = toApiParams(
      query({
        q: 'novak',
        conditions: [{ field: 'phone', value: '041' }],
        tags: ['vip'],
        sort: { attribute: 'podjetje' },
        dir: 'desc',
        size: 50,
        page: 3,
      }),
    );

    expect(params.get('page')).toBe('2');
    expect(params.get('size')).toBe('50');
    expect(params.get('q')).toBe('novak');
    expect(params.getAll('f')).toEqual(['phone:041']);
    expect(params.getAll('tag')).toEqual(['vip']);
    expect(params.get('sort')).toBe('x.podjetje');
    expect(params.get('dir')).toBe('desc');
    expect(toApiParams(query()).get('page')).toBe('0');
    expect(toApiParams(query()).get('size')).toBe('25');
  });

  it('FR-008-11: število filtrov so pogoji in značke, iskalni niz ne šteje', () => {
    expect(countFilters(query())).toBe(0);
    expect(countFilters(query({ q: 'novak' }))).toBe(0);
    expect(
      countFilters(
        query({
          q: 'novak',
          conditions: [
            { field: 'email', value: 'a' },
            { field: 'phone', value: 'b' },
          ],
          tags: ['a', 'b', 'c'],
        }),
      ),
    ).toBe(5);
  });

  it('FR-008-11: opis filtra v slovenščini in angleščini', () => {
    const sl = i18n.getFixedT('sl');
    const en = i18n.getFixedT('en');
    const attribute = {
      kind: 'condition',
      condition: { field: { attribute: 'kompetenca' }, value: 'web' },
    } as const;
    const email = {
      kind: 'condition',
      condition: { field: 'email', value: 'feri.si' },
    } as const;
    const tag = { kind: 'tag', tag: 'konferenca2025' } as const;

    expect(describeFilter(attribute, sl)).toBe('kompetenca vsebuje web');
    expect(describeFilter(email, sl)).toBe('E-naslov vsebuje feri.si');
    expect(describeFilter(tag, sl)).toBe('Značka: konferenca2025');
    expect(describeFilter(attribute, en)).toBe('kompetenca contains web');
    expect(describeFilter(email, en)).toBe('Email contains feri.si');
    expect(describeFilter(tag, en)).toBe('Tag: konferenca2025');
  });

  it('FR-008-08: sprememba iskanja, filtra, razvrstitve ali velikosti postavi stran na 1, sprememba strani ne', () => {
    const onPageFour = query({ page: 4, size: 25 });

    expect(withChange(onPageFour, { q: 'novak' }).page).toBe(1);
    expect(withChange(onPageFour, { conditions: [{ field: 'email', value: 'a' }] }).page).toBe(1);
    expect(withChange(onPageFour, { tags: ['vip'] }).page).toBe(1);
    expect(withChange(onPageFour, { sort: 'email' }).page).toBe(1);
    expect(withChange(onPageFour, { dir: 'desc' }).page).toBe(1);
    expect(withChange(onPageFour, { size: 100 }).page).toBe(1);
    expect(withChange(onPageFour, { page: 5 }).page).toBe(5);
    expect(withChange(onPageFour, { q: 'novak' }).q).toBe('novak');
    expect(withChange(onPageFour, { sort: 'email' }).size).toBe(25);
  });
});
