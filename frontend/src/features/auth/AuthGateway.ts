// Meja med aplikacijo in ponudnikom prijave (research R-09): v aplikaciji Firebase SDK, v testih izvedba v pomnilniku.

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/** Vzrok neuspešne prijave, ki ga vmesnik prevede v sporočilo (plan.md – Key elements, FR-001-04). */
export type SignInErrorCode = 'cancelled' | 'popup-blocked' | 'offline' | 'failed';

export class SignInError extends Error {
  constructor(readonly code: SignInErrorCode) {
    super(`sign-in failed: ${code}`);
    this.name = 'SignInError';
  }
}

export interface AuthGateway {
  /**
   * Posluša stanje prijave. Poslušalec je poklican, ko je stanje znano, in ob vsaki spremembi (`null` = odjavljen,
   * tudi ko se uporabnik odjavi v drugem zavihku). Vrne funkcijo, ki poslušanje ustavi.
   */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  /** Prijava z Googlom; ob neuspehu vrže {@link SignInError}. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** ID žeton trenutnega uporabnika ali `null`, če ni prijavljen; vrže, če žetona ni mogoče podaljšati. */
  getIdToken(): Promise<string | null>;
}
