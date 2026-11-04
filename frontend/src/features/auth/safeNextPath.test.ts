import { describe, expect, it } from 'vitest';

import { safeNextPath } from './safeNextPath';

describe('safeNextPath', () => {
  it.each(['/a/b?c=1', '/account?x=1', '/', '/groups/12/contacts#top'])(
    'FR-001-06: pot znotraj aplikacije %s ostane',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ['null', null],
    ['prazen niz', ''],
    ['protokolno relativen URL', '//zlonamerno.si'],
    ['poševnica nazaj', '/\\zlonamerno.si'],
    ['absoluten URL', 'https://zlonamerno.si/a'],
    ['shema javascript', 'javascript:alert(1)'],
    ['relativna pot', 'a/b'],
    ['stran za prijavo', '/login?next=/account'],
  ])('FR-001-06: %s vodi na začetno stran', (_label, next) => {
    expect(safeNextPath(next)).toBe('/');
  });
});
