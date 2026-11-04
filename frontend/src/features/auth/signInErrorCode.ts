import type { SignInErrorCode } from './AuthGateway';

/**
 * Preslikava kode napake Firebase Auth v vzrok, ki ga prikaže kartica za prijavo (FR-001-04, research R-04).
 * Ločeno od SDK, da je preverljivo brez nalaganja Firebase.
 */
export function signInErrorCode(
  firebaseCode: string | undefined,
  online: boolean,
): SignInErrorCode {
  if (!online) return 'offline';
  switch (firebaseCode) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'cancelled';
    case 'auth/popup-blocked':
      return 'popup-blocked';
    case 'auth/network-request-failed':
      return 'offline';
    default:
      return 'failed';
  }
}
