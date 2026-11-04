import {
  type AuthGateway,
  type AuthUser,
  SignInError,
  type SignInErrorCode,
} from '../features/auth/AuthGateway';

// Izvedba AuthGateway v pomnilniku za FE teste (research R-09): Firebase SDK se v jsdom ne naloži.

export const ANA: AuthUser = { uid: 'uid-ana', email: 'ana@primer.si', displayName: 'Ana Novak' };

export interface AuthFake extends AuthGateway {
  /** Trenutni uporabnik v ponudniku prijave. */
  readonly currentUser: AuthUser | null;
  /** Kolikokrat je aplikacija poklicala signOut. */
  readonly signOutCalls: number;
  /** Kolikokrat je aplikacija poklicala signInWithGoogle. */
  readonly signInCalls: number;
  /** Naslednja prijava ne uspe z dano kodo. */
  failNextSignIn(code: SignInErrorCode): void;
  /** Uporabnik, ki ga prijavi naslednja uspešna prijava (privzeto {@link ANA}). */
  setNextUser(user: AuthUser): void;
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
  const listeners = new Set<(user: AuthUser | null) => void>();

  const notify = () => {
    if (!known) return;
    for (const listener of [...listeners]) listener(user);
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
    onChange(listener) {
      listeners.add(listener);
      if (known) queueMicrotask(() => listeners.has(listener) && listener(user));
      return () => listeners.delete(listener);
    },
    signInWithGoogle() {
      signInCalls += 1;
      if (nextError) {
        const code = nextError;
        nextError = null;
        return Promise.reject(new SignInError(code));
      }
      user = nextUser;
      tokenFails = false;
      notify();
      return Promise.resolve();
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
