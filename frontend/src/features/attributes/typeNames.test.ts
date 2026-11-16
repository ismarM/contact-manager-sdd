import { describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import { ATTRIBUTE_TYPES } from './types';
import { typeNameKey } from './typeNames';

describe('typeNameKey', () => {
  it('FR-016-01: vsak tip ima ime v slovenščini in angleščini', async () => {
    for (const language of ['sl', 'en'] as const) {
      await i18n.changeLanguage(language);
      const names = ATTRIBUTE_TYPES.map((type) => i18n.t(typeNameKey(type)));

      expect(names.every((name) => name !== '' && !name.startsWith('attributes.'))).toBe(true);
      expect(new Set(names).size).toBe(ATTRIBUTE_TYPES.length);
    }
    await i18n.changeLanguage('sl');
  });

  it('FR-016-01: tip PHONE je Telefon / Phone', async () => {
    await i18n.changeLanguage('sl');
    expect(i18n.t(typeNameKey('PHONE'))).toBe('Telefon');
    await i18n.changeLanguage('en');
    expect(i18n.t(typeNameKey('PHONE'))).toBe('Phone');
    await i18n.changeLanguage('sl');
  });
});
