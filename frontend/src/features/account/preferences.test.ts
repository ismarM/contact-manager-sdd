import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  initialLanguage,
  readStoredLanguage,
  readStoredTheme,
  storeLanguage,
} from './preferences';

describe('preferences', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('FR-001-15: shrani in prebere izbiro jezika, null jo izbriše', () => {
    storeLanguage('en');
    expect(localStorage.getItem('language')).toBe('en');
    expect(readStoredLanguage()).toBe('en');

    storeLanguage(null);
    expect(localStorage.getItem('language')).toBeNull();
    expect(readStoredLanguage()).toBeNull();
  });

  it('FR-001-17: Svetla in Temna nastavita data-theme in ključ, Sistemska oboje odstrani', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(readStoredTheme()).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(readStoredTheme()).toBe('light');

    applyTheme(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBeNull();
    expect(readStoredTheme()).toBeNull();
  });

  it('FR-001-16: neznana shranjena vrednost se prezre', () => {
    localStorage.setItem('language', 'de');
    localStorage.setItem('theme', 'blue');

    expect(readStoredLanguage()).toBeNull();
    expect(readStoredTheme()).toBeNull();
    expect(initialLanguage('sl-SI')).toBe('sl');
  });

  it.each([
    ['sl', 'sl'],
    ['sl-SI', 'sl'],
    ['de-DE', 'en'],
    ['en-US', 'en'],
  ] as const)('FR-001-16: brez shranjene izbire jezik brskalnika %s → %s', (browser, expected) => {
    expect(initialLanguage(browser)).toBe(expected);
  });

  it('FR-001-16: shranjena izbira ima prednost pred jezikom brskalnika', () => {
    localStorage.setItem('language', 'en');
    expect(initialLanguage('sl-SI')).toBe('en');

    localStorage.setItem('language', 'sl');
    expect(initialLanguage('de-DE')).toBe('sl');
  });

  it('FR-001-15: nedostopen localStorage (zasebni način) ne podre izbire', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readStoredLanguage()).toBeNull();
    expect(readStoredTheme()).toBeNull();
    expect(initialLanguage('sl-SI')).toBe('sl');
    expect(() => storeLanguage('en')).not.toThrow();
    expect(() => applyTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
