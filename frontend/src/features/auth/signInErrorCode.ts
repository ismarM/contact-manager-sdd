import type { SignInErrorCode } from './AuthGateway';

/**
 * Preslikava kode napake Firebase Auth v vzrok, ki ga prikaže kartica za prijavo (FR-001-04, research R-04) –
 * implementacija v T032. Ločeno od SDK, da je preverljivo brez nalaganja Firebase.
 */
export function signInErrorCode(
  firebaseCode: string | undefined,
  online: boolean,
): SignInErrorCode {
  throw new Error(`not implemented: ${String(firebaseCode)} ${String(online)}`);
}
