import { describe, expect, it } from 'vitest';

import { auditSearch, hasFilters, readAuditView } from './auditRouting';

// Filter po izvajalcu v poti (FR-015-01): žeton (uuid) ali `deleted`; druga oblika je neveljavna.

const TOKEN = '0193c4a2-7a1f-7c3e-9b1a-aaaaaaaa0001';

describe('auditRouting – izvajalec', () => {
  it('actor je žeton ali deleted; krožno brez privzetih vrednosti', () => {
    const view = readAuditView(new URLSearchParams(`actor=${TOKEN}&action=RESTORE`));

    expect(view.filters).toEqual({ actions: ['RESTORE'], contact: null, actor: TOKEN });
    expect(view.contactInvalid).toBe(false);
    expect(auditSearch(1, 25, view.filters)).toBe(`?action=RESTORE&actor=${TOKEN}`);
    expect(readAuditView(new URLSearchParams('actor=deleted')).filters.actor).toBe('deleted');
  });

  it('neveljavna oblika je neveljaven filter, neznana vrsta dejanja se prezre', () => {
    const view = readAuditView(new URLSearchParams('actor=foo&action=EXPORT'));

    expect(view.filters).toEqual({ actions: [], contact: null, actor: null });
    expect(view.contactInvalid).toBe(true);
    expect(hasFilters(view.filters, view.contactInvalid)).toBe(true);
  });

  it('izvajalec je filter', () => {
    expect(hasFilters({ actions: [], contact: null, actor: TOKEN }, false)).toBe(true);
    expect(hasFilters({ actions: [], contact: null, actor: null }, false)).toBe(false);
  });
});
