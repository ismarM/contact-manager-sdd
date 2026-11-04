import { describe, expect, it } from 'vitest';

import { detectLanguage } from './language';

describe('detectLanguage', () => {
  it.each([
    ['sl-SI', 'sl'],
    ['sl', 'sl'],
    ['SL', 'sl'],
    ['de', 'en'],
    ['en-US', 'en'],
    ['', 'en'],
  ])('FR-000-14: jezik brskalnika %s → %s', (browserLanguage, expected) => {
    expect(detectLanguage(browserLanguage)).toBe(expected);
  });
});
