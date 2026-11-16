// Meja med aplikacijo in ponudnikom prijave (research R-09): v aplikaciji Firebase SDK, v testih izvedba v pomnilniku.

/** Ponudnik prijave, povezan z računom (017: Google in e-pošta z geslom). */
export type AuthProviderId = 'google.com' | 'password';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** E-naslov je potrjen (FR-017-02); zaledje brez tega vrne 403 EMAIL_NOT_VERIFIED. */
  emailVerified: boolean;
  /** Povezani ponudniki prijave (FR-017-09). */
  providers: AuthProviderId[];
}

/**
 * Vzrok neuspešne prijave ali dejanja z računom, ki ga vmesnik prevede v sporočilo (FR-001-04, FR-017-06). Napačno
 * geslo, neobstoječ račun in račun brez gesla so ena koda (`invalid-credentials`), da sporočilo ne razkrije obstoja
 * računa.
 */
export type SignInErrorCode =
  | 'cancelled'
  | 'popup-blocked'
  | 'offline'
  | 'failed'
  | 'invalid-credentials'
  | 'email-in-use'
  | 'invalid-email'
  | 'weak-password'
  | 'too-many-requests'
  | 'requires-recent-login';

export class SignInError extends Error {
  constructor(readonly code: SignInErrorCode) {
    super(`sign-in failed: ${code}`);
    this.name = 'SignInError';
  }
}

export interface AuthGateway {
  /**
   * Posluša stanje prijave. Poslušalec je poklican, ko je stanje znano, in ob vsaki spremembi (`null` = odjavljen,
   * tudi ko se uporabnik odjavi v drugem zavihku) ter po osvežitvi potrditve e-naslova. Vrne funkcijo, ki poslušanje
   * ustavi.
   */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  /** Prijava z Googlom; ob neuspehu vrže {@link SignInError}. */
  signInWithGoogle(): Promise<void>;
  /** Prijava z e-naslovom in geslom (FR-017-05); ob neuspehu vrže {@link SignInError}. */
  signInWithPassword(email: string, password: string): Promise<void>;
  /**
   * Registracija z e-naslovom in geslom (FR-017-01): ustvari račun, ga prijavi in pošlje potrditveno sporočilo
   * (neuspelo pošiljanje ne prekine registracije – uporabnik ga ponovi na zaslonu potrditve).
   */
  signUpWithPassword(email: string, password: string): Promise<void>;
  /** Ponovno pošlje potrditveno sporočilo (FR-017-03); omejitev pogostosti vrne `too-many-requests`. */
  sendVerificationEmail(): Promise<void>;
  /**
   * Prebere stanje potrditve pri ponudniku (FR-017-13): `reload()`; če je e-naslov potrjen, osveži ID žeton
   * (`getIdToken(true)`, nov zahtevek `email_verified=true`) in šele nato obvesti poslušalce. Vrne, ali je potrjen.
   */
  refreshVerification(): Promise<boolean>;
  /**
   * Pošlje sporočilo za ponastavitev gesla (FR-017-07). Neobstoječ račun ni napaka (ne razkrije obstoja); vrže samo
   * {@link SignInError} `offline` ali `too-many-requests`.
   */
  sendPasswordReset(email: string): Promise<void>;
  /**
   * Ponovna avtentikacija (FR-017-12) z metodo, ki jo ima račun: z geslom, če je podano, sicer z Googlom v pojavnem
   * oknu. Vrne svež ID žeton z novim `auth_time`; ob neuspehu vrže {@link SignInError} in ne spremeni ničesar.
   */
  reauthenticate(password?: string): Promise<string>;
  signOut(): Promise<void>;
  /** ID žeton trenutnega uporabnika ali `null`, če ni prijavljen; vrže, če žetona ni mogoče podaljšati. */
  getIdToken(): Promise<string | null>;
}
