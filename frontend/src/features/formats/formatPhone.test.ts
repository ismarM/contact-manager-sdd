import { describe, expect, it } from 'vitest';

import { formatPhone } from './formatPhone';

describe('formatPhone', () => {
  it.each([
    ['+38641123456', 'INTERNATIONAL', '+386 41 123 456'],
    ['+38641123456', null, '+386 41 123 456'],
    ['+38641123456', 'NATIONAL', '041 123 456'],
    ['+38641123456', 'E164', '+38641123456'],
    ['+436641234567', 'NATIONAL', '0664 1234567'],
    ['+436641234567', 'INTERNATIONAL', '+43 664 1234567'],
    ['+12025550123', 'NATIONAL', '(202) 555-0123'],
    ['+12025550123', 'INTERNATIONAL', '+1 202 555 0123'],
    ['+442079460958', 'NATIONAL', '020 7946 0958'],
  ] as const)('FR-016-16: %s po shemi %s → %s', (value, format, expected) => {
    expect(formatPhone(value, format)).toBe(expected);
  });

  it.each(['041 123 456', 'ni številka', '+1', ''])(
    'FR-016-16: vrednost, ki je ni mogoče oblikovati (%s), ostane kanonična',
    (value) => {
      for (const format of ['INTERNATIONAL', 'NATIONAL', 'E164'] as const) {
        expect(formatPhone(value, format)).toBe(value);
      }
    },
  );
});
