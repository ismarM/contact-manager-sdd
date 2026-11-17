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

  it.each([
    ['auth/invalid-credential', 'invalid-credentials'],
    ['auth/invalid-login-credentials', 'invalid-credentials'],
    ['auth/user-not-found', 'invalid-credentials'],
    ['auth/wrong-password', 'invalid-credentials'],
    ['auth/email-already-in-use', 'email-in-use'],
    ['auth/invalid-email', 'invalid-email'],
    ['auth/weak-password', 'weak-password'],
    ['auth/password-does-not-meet-requirements', 'weak-password'],
    ['auth/too-many-requests', 'too-many-requests'],
    ['auth/requires-recent-login', 'requires-recent-login'],
  ] as const)(
    'FR-017-06: koda %s → %s (ena koda za vse neuspešne prijave z geslom)',
    (code, expected) => {
      expect(signInErrorCode(code, true)).toBe(expected);
    },
  );

  it.each(['auth/internal-error', 'auth/popup-closed-by-user', undefined])(
    'FR-001-04: brez povezave (navigator.onLine === false) je vzrok vedno »offline« (%s)',
    (firebaseCode) => {
      expect(signInErrorCode(firebaseCode, false)).toBe('offline');
    },
  );
});
