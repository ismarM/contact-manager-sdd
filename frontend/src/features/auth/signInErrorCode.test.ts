import { describe, expect, it } from 'vitest';

import { signInErrorCode } from './signInErrorCode';

// FR-001-04, research R-04: dejanski vzroki napak Firebase → sporočilo v kartici (plan.md – Key elements, Prijava/alert).
describe('signInErrorCode', () => {
  it.each([
    ['auth/popup-closed-by-user', 'cancelled'],
    ['auth/cancelled-popup-request', 'cancelled'],
    ['auth/popup-blocked', 'popup-blocked'],
    ['auth/network-request-failed', 'offline'],
    ['auth/internal-error', 'failed'],
    ['auth/operation-not-allowed', 'failed'],
    [undefined, 'failed'],
  ] as const)('FR-001-04: koda %s → %s', (firebaseCode, expected) => {
    expect(signInErrorCode(firebaseCode, true)).toBe(expected);
  });

  it.each(['auth/internal-error', 'auth/popup-closed-by-user', undefined])(
    'FR-001-04: brez povezave (navigator.onLine === false) je vzrok vedno »offline« (%s)',
    (firebaseCode) => {
      expect(signInErrorCode(firebaseCode, false)).toBe('offline');
    },
  );
});
