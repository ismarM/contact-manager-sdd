import type { SignInErrorCode } from './AuthGateway';

/** Ključ prevoda za vzrok neuspešne prijave ali dejanja z računom (FR-001-04, FR-017-06, FR-017-22). */
export const AUTH_ERROR_KEYS = {
  cancelled: 'login.error.cancelled',
  'popup-blocked': 'login.error.popupBlocked',
  offline: 'login.error.offline',
  failed: 'login.error.failed',
  'invalid-credentials': 'auth.error.invalidCredentials',
  'email-in-use': 'auth.error.emailInUse',
  'invalid-email': 'auth.error.invalidEmail',
  'weak-password': 'auth.error.weakPassword',
  'too-many-requests': 'auth.error.tooManyRequests',
  'requires-recent-login': 'auth.error.requiresRecentLogin',
  'credential-in-use': 'auth.error.credentialInUse',
} as const satisfies Record<SignInErrorCode, string>;

export function authErrorKey(error: unknown): (typeof AUTH_ERROR_KEYS)[SignInErrorCode] {
  const code: SignInErrorCode =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code in AUTH_ERROR_KEYS
      ? (error.code as SignInErrorCode)
      : 'failed';
  return AUTH_ERROR_KEYS[code];
}
