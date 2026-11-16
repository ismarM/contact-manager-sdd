import { describe, expect, it } from 'vitest';

import {
  deletedSearch,
  pagingSearch,
  readDeletedView,
  readPaging,
  stateName,
} from './historyRouting';

// Stanje zaslonov zgodovine v poti (plan.md 015 – Pages and routes).

describe('historyRouting', () => {
  it('stran in velikost: privzete vrednosti se ne zapišejo, neveljavne se prezrejo', () => {
    expect(readPaging(new URLSearchParams('page=3&size=50'))).toEqual({ page: 3, size: 50 });
    expect(readPaging(new URLSearchParams('page=0&size=7'))).toEqual({ page: 1, size: 25 });
    expect(pagingSearch(1, 25)).toBe('');
    expect(pagingSearch(2, 100)).toBe('?page=2&size=100');
  });

  it('izbrisani: q, state, page, size – krožno in brez privzetih vrednosti', () => {
    const view = readDeletedView(new URLSearchParams('q=nov&state=merged&page=2&size=50'));

    expect(view).toEqual({ q: 'nov', state: 'merged', page: 2, size: 50 });
    expect(deletedSearch(view)).toBe('?q=nov&state=merged&page=2&size=50');
    expect(deletedSearch({ q: '', state: 'all', page: 1, size: 25 })).toBe('');
    expect(readDeletedView(new URLSearchParams('state=foo')).state).toBe('all');
    expect(readDeletedView(new URLSearchParams(`q=${'a'.repeat(150)}`)).q).toHaveLength(100);
  });

  it('ime kontakta iz stanja', () => {
    expect(stateName({ firstName: 'Janez', lastName: 'Novak' })).toBe('Janez Novak');
    expect(stateName({ firstName: null, lastName: 'Novak' })).toBe('Novak');
  });
});
