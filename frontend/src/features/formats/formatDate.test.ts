import { describe, expect, it } from 'vitest';

import { formatDate, localCalendarDate } from './formatDate';

describe('formatDate', () => {
  it.each([
    ['2026-11-16', 'LOCALE', 'sl', '16. 11. 2026'],
    ['2026-11-16', null, 'sl', '16. 11. 2026'],
    ['2026-11-16', 'LOCALE', 'en', '16/11/2026'],
    ['2026-11-16', 'ISO', 'sl', '2026-11-16'],
    ['2026-11-16', 'ISO', 'en', '2026-11-16'],
    ['2026-11-16', 'LONG', 'sl', '16. november 2026'],
    ['2026-11-16', 'LONG', 'en', '16 November 2026'],
    ['2026-01-01', 'LONG', 'sl', '1. januar 2026'],
    ['2024-02-29', 'LOCALE', 'sl', '29. 2. 2024'],
  ] as const)('FR-016-16: %s po shemi %s (%s) → %s', (value, format, language, expected) => {
    expect(formatDate(value, format, language)).toBe(expected);
  });

  it.each(['2026-02-30', '2026-13-01', '16. 11. 2026', 'jutri', ''])(
    'FR-016-16: neveljaven datum (%s) ostane kanoničen',
    (value) => {
      expect(formatDate(value, 'LONG', 'sl')).toBe(value);
      expect(formatDate(value, 'LOCALE', 'en')).toBe(value);
    },
  );
});

// Testi tečejo v Europe/Ljubljana (vitest.config.ts).
describe('localCalendarDate', () => {
  it.each([
    ['2026-11-05T10:00:00Z', '2026-11-05'],
    ['2026-11-25T23:30:00Z', '2026-11-26'],
    ['2026-07-01T22:15:00.123456Z', '2026-07-02'],
  ])(
    'design.md 8.6a: trenutek %s je koledarski datum %s v časovnem pasu brskalnika',
    (instant, expected) => {
      expect(localCalendarDate(instant)).toBe(expected);
    },
  );

  it('neveljaven trenutek ostane nespremenjen', () => {
    expect(localCalendarDate('jutri')).toBe('jutri');
  });
});
