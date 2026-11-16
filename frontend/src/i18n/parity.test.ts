import { describe, expect, it } from 'vitest';

import en from './en.json';
import sl from './sl.json';

// Pariteta prevodov sl/en (FR-000-14, 016 FR-016-27): enaki ključi v obeh jezikih, brez praznih besedil.

function leafKeys(value: unknown, prefix = ''): string[] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function leaves(value: unknown, prefix = ''): [string, unknown][] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [[prefix, value]];
}

describe('prevodi sl/en', () => {
  it('FR-016-27: oba jezika imata enake ključe', () => {
    const slKeys = leafKeys(sl).sort();
    const enKeys = leafKeys(en).sort();

    expect(enKeys.filter((key) => !slKeys.includes(key))).toEqual([]);
    expect(slKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it('FR-016-27: nobeno besedilo ni prazno', () => {
    const empty = [...leaves(sl), ...leaves(en)]
      .filter(([, text]) => typeof text !== 'string' || text.trim() === '')
      .map(([key]) => key);

    expect(empty).toEqual([]);
  });

  it('FR-016-01: vsak tip ključa ima ime v obeh jezikih', () => {
    const types = ['OTHER', 'NOTES', 'EMAIL', 'PHONE', 'ADDRESS', 'URL', 'DATE'];

    expect(Object.keys(sl.attributes.types).sort()).toEqual([...types].sort());
    expect(Object.keys(en.attributes.types).sort()).toEqual([...types].sort());
  });

  it('FR-016-01: imena tipov se v jeziku ne ponavljajo', () => {
    expect(new Set(Object.values(sl.attributes.types)).size).toBe(7);
    expect(new Set(Object.values(en.attributes.types)).size).toBe(7);
  });

  it('FR-016-17: spremenljivke v besedilih so v obeh jezikih enake', () => {
    const variables = (text: unknown) =>
      typeof text === 'string' ? (text.match(/{{\w+}}/g) ?? []).sort().join(',') : '';
    const enByKey = new Map(leaves(en));
    const different = leaves(sl)
      .filter(([key, text]) => variables(text) !== variables(enByKey.get(key)))
      .map(([key]) => key);

    expect(different).toEqual([]);
  });
});
