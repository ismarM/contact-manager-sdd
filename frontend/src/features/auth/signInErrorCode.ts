import type { SignInErrorCode } from './AuthGateway';

/**
 * Preslikava kode napake Firebase Auth v vzrok, ki ga prikaže vmesnik (FR-001-04, FR-017-06, research R-04 in R-02).
 * Ločeno od SDK, da je preverljivo brez nalaganja Firebase. Vse kode neuspešne prijave z geslom so ena koda, da
 * sporočilo ne razkrije, ali račun obstaja (pri zaščiti pred naštevanjem Firebase sam vrne `invalid-credential`).
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
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/user-mismatch':
    case 'auth/user-disabled':
      return 'invalid-credentials';
    case 'auth/email-already-in-use':
      return 'email-in-use';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'invalid-email';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'weak-password';
    case 'auth/too-many-requests':
      return 'too-many-requests';
    case 'auth/credential-already-in-use':
    case 'auth/provider-already-linked':
      return 'credential-in-use';
    case 'auth/requires-recent-login':
      return 'requires-recent-login';
    default:
      return 'failed';
  }
}
