import {
  type AuthGateway,
  type AuthUser,
  SignInError,
  type SignInErrorCode,
} from '../features/auth/AuthGateway';

// Izvedba AuthGateway v pomnilniku za FE teste (research R-09): Firebase SDK se v jsdom ne naloži.

export const ANA: AuthUser = {
  uid: 'uid-ana',
  email: 'ana@primer.si',
  displayName: 'Ana Novak',
  emailVerified: true,
  providers: ['google.com'],
};

/** Račun z geslom v lažnem ponudniku (017). */
interface PasswordAccount {
  password: string;
  user: AuthUser;
  /** E-naslov je potrjen pri ponudniku (povezava v sporočilu je bila odprta), uporabnik tega morda še ne ve. */
  verified: boolean;
}

export interface AuthFake extends AuthGateway {
  /** Trenutni uporabnik v ponudniku prijave. */
  readonly currentUser: AuthUser | null;
  /** Kolikokrat je aplikacija poklicala signOut. */
  readonly signOutCalls: number;
  /** Kolikokrat je aplikacija poklicala signInWithGoogle. */
  readonly signInCalls: number;
  /** Poslana potrditvena sporočila (registracija in ponovno pošiljanje). */
  readonly verificationEmails: number;
  /** E-naslovi, za katere je aplikacija zahtevala ponastavitev gesla. */
  readonly passwordResets: readonly string[];
  /** Klici ponovne avtentikacije (`password` ali `google`). */
  readonly reauthentications: readonly ('password' | 'google')[];
  /** Naslednja prijava ali dejanje z računom ne uspe z dano kodo. */
  failNextSignIn(code: SignInErrorCode): void;
  /** Uporabnik, ki ga prijavi naslednja uspešna prijava (privzeto {@link ANA}). */
  setNextUser(user: AuthUser): void;
  /** Doda račun z geslom (potrjen, razen če `verified: false`). */
  addPasswordAccount(email: string, password: string, options?: { verified?: boolean }): AuthUser;
  /** Uporabnik odpre povezavo za potrditev (npr. v drugem zavihku); aplikacija tega ne izve sama. */
  verifyEmail(email: string): void;
  /** Uporabnik se je odjavil v drugem zavihku: stanje postane null brez klica signOut v tej aplikaciji. */
  emitSignedOut(): void;
  /** Uporabnik je izgubljen brez obvestila (npr. pred dogodkom iz drugega zavihka): getIdToken vrne null. */
  dropUserSilently(): void;
  /** Žetona ni več mogoče podaljšati: getIdToken vrže. */
  failTokenRefresh(): void;
  /** Stanje prijave še ni znano, dokler test ne pokliče resolveInitialState (za preverjanje, da se nič ne izriše). */
  resolveInitialState(): void;
}

export function createAuthFake(
  options: { user?: AuthUser | null; initialStateKnown?: boolean } = {},
): AuthFake {
  let user: AuthUser | null = options.user ?? null;
  let known = options.initialStateKnown ?? true;
  let nextUser: AuthUser = ANA;
  let nextError: SignInErrorCode | null = null;
  let tokenFails = false;
  let signOutCalls = 0;
  let signInCalls = 0;
  let verificationEmails = 0;
  const passwordResets: string[] = [];
  const reauthentications: ('password' | 'google')[] = [];
  const accounts = new Map<string, PasswordAccount>();
  const listeners = new Set<(user: AuthUser | null) => void>();

  const notify = () => {
    if (!known) return;
    for (const listener of [...listeners]) listener(user);
  };

  const takeError = (): SignInError | null => {
    if (!nextError) return null;
    const error = new SignInError(nextError);
    nextError = null;
    return error;
  };

  const addAccount = (email: string, password: string, verified: boolean): AuthUser => {
    const account: PasswordAccount = {
      password,
      verified,
      user: {
        uid: `uid-${email}`,
        email,
        displayName: null,
        emailVerified: verified,
        providers: ['password'],
      },
    };
    accounts.set(email.toLowerCase(), account);
    return account.user;
  };

  return {
    get currentUser() {
      return user;
    },
    get signOutCalls() {
      return signOutCalls;
    },
    get signInCalls() {
      return signInCalls;
    },
    get verificationEmails() {
      return verificationEmails;
    },
    get passwordResets() {
      return passwordResets;
    },
    get reauthentications() {
      return reauthentications;
    },
    onChange(listener) {
      listeners.add(listener);
      if (known) queueMicrotask(() => listeners.has(listener) && listener(user));
      return () => listeners.delete(listener);
    },
    signInWithGoogle() {
      signInCalls += 1;
      const error = takeError();
      if (error) return Promise.reject(error);
      user = nextUser;
      tokenFails = false;
      notify();
      return Promise.resolve();
    },
    signInWithPassword(email, password) {
      const error = takeError();
      if (error) return Promise.reject(error);
      const account = accounts.get(email.toLowerCase());
      if (!account || account.password !== password) {
        return Promise.reject(new SignInError('invalid-credentials'));
      }
      user = { ...account.user, emailVerified: account.verified };
      tokenFails = false;
      notify();
      return Promise.resolve();
    },
    signUpWithPassword(email, password) {
      const error = takeError();
      if (error) return Promise.reject(error);
      if (accounts.has(email.toLowerCase())) {
        return Promise.reject(new SignInError('email-in-use'));
      }
      user = addAccount(email, password, false);
      verificationEmails += 1;
      tokenFails = false;
      notify();
      return Promise.resolve();
    },
    sendVerificationEmail() {
      const error = takeError();
      if (error) return Promise.reject(error);
      verificationEmails += 1;
      return Promise.resolve();
    },
    refreshVerification() {
      const error = takeError();
      if (error) return Promise.reject(error);
      const account = user?.email ? accounts.get(user.email.toLowerCase()) : undefined;
      if (!user || !account?.verified) return Promise.resolve(false);
      user = { ...user, emailVerified: true };
      notify();
      return Promise.resolve(true);
    },
    sendPasswordReset(email) {
      const error = takeError();
      if (error) return Promise.reject(error);
      passwordResets.push(email);
      return Promise.resolve();
    },
    reauthenticate(password) {
      reauthentications.push(password === undefined ? 'google' : 'password');
      const error = takeError();
      if (error) return Promise.reject(error);
      if (!user) return Promise.reject(new SignInError('failed'));
      if (password !== undefined) {
        const account = user.email ? accounts.get(user.email.toLowerCase()) : undefined;
        if (!account || account.password !== password) {
          return Promise.reject(new SignInError('invalid-credentials'));
        }
      }
      return Promise.resolve(`token-${user.uid}-fresh`);
    },
    signOut() {
      signOutCalls += 1;
      user = null;
      notify();
      return Promise.resolve();
    },
    getIdToken() {
      if (tokenFails) return Promise.reject(new Error('token refresh failed'));
      return Promise.resolve(user ? `token-${user.uid}` : null);
    },
    failNextSignIn(code) {
      nextError = code;
    },
    setNextUser(next) {
      nextUser = next;
    },
    addPasswordAccount(email, password, accountOptions = {}) {
      return addAccount(email, password, accountOptions.verified ?? true);
    },
    verifyEmail(email) {
      const account = accounts.get(email.toLowerCase());
      if (account) account.verified = true;
    },
    emitSignedOut() {
      user = null;
      notify();
    },
    dropUserSilently() {
      user = null;
    },
    failTokenRefresh() {
      tokenFails = true;
    },
    resolveInitialState() {
      known = true;
      notify();
    },
  };
}
