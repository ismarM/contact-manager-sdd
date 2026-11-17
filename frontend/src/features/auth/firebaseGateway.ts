import { initializeApp } from 'firebase/app';
import {
  type Auth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
  updatePassword,
} from 'firebase/auth';

import { type AuthGateway, type AuthProviderId, type AuthUser, SignInError } from './AuthGateway';
import { signInErrorCode } from './signInErrorCode';

const env = import.meta.env;

function firebaseCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function toSignInError(error: unknown): SignInError {
  return new SignInError(signInErrorCode(firebaseCode(error), navigator.onLine));
}

function isProvider(id: string): id is AuthProviderId {
  return id === 'google.com' || id === 'password';
}

/** Uporabnik SDK → AuthUser (FR-017-02, FR-017-09). */
export function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    providers: user.providerData.map((info) => info.providerId).filter(isProvider),
    hasPhotoUrl: Boolean(user.photoURL),
  };
}

/** Koda napake REST klica `accounts:signUp` z idToken (npr. `WEAK_PASSWORD : …`) → vzrok za vmesnik. */
function restErrorCode(message: string | undefined): SignInError {
  const code = (message ?? '').split(/[\s:]/)[0];
  switch (code) {
    case 'WEAK_PASSWORD':
    case 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS':
      return new SignInError('weak-password');
    case 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN':
    case 'TOKEN_EXPIRED':
    case 'INVALID_ID_TOKEN':
      return new SignInError('requires-recent-login');
    case 'EMAIL_EXISTS':
    case 'CREDENTIAL_ALREADY_IN_USE':
      return new SignInError('credential-in-use');
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new SignInError('too-many-requests');
    default:
      return new SignInError('failed');
  }
}

/** Firebase Auth za aplikacijo: privzeto demo projekt in emulator na istem izvoru (nginx ali Vite ga posredujeta). */
function createAuth(): Auth {
  const projectId = env.VITE_FIREBASE_PROJECT_ID ?? 'demo-contact-manager';
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY ?? 'demo-api-key',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
  });
  const auth = getAuth(app);
  if (env.VITE_FIREBASE_EMULATOR !== 'false') {
    connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
  }
  return auth;
}

/**
 * Izvedba AuthGateway s Firebase JS SDK (research R-04 v 001 in 017): prijava z Googlom v pojavnem oknu ali z
 * e-naslovom in geslom, obstojnost v IndexedDB (deli se med zavihki). `auth` je lahko podan (testi z lažnim SDK).
 */
export function createFirebaseGateway(auth: Auth = createAuth()): AuthGateway {
  const listeners = new Set<(user: AuthUser | null) => void>();

  const current = (): User => {
    const user = auth.currentUser;
    if (!user) throw new SignInError('failed');
    return user;
  };

  return {
    onChange(listener) {
      listeners.add(listener);
      const unsubscribe = onAuthStateChanged(auth, (user) =>
        listener(user ? toAuthUser(user) : null),
      );
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
    async signInWithGoogle() {
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (error) {
        throw toSignInError(error);
      }
    },
    async signInWithPassword(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        throw toSignInError(error);
      }
    },
    async signUpWithPassword(email, password) {
      let user: User;
      try {
        ({ user } = await createUserWithEmailAndPassword(auth, email, password));
      } catch (error) {
        throw toSignInError(error);
      }
      try {
        await sendEmailVerification(user);
      } catch {
        // Račun obstaja; sporočilo uporabnik pošlje znova na zaslonu potrditve (FR-017-03).
      }
    },
    async sendVerificationEmail() {
      try {
        await sendEmailVerification(current());
      } catch (error) {
        throw error instanceof SignInError ? error : toSignInError(error);
      }
    },
    async refreshVerification() {
      const user = current();
      try {
        await reload(user);
      } catch (error) {
        throw toSignInError(error);
      }
      if (!user.emailVerified) return false;
      // Najprej svež žeton z email_verified=true, šele nato poslušalci (ti sprožijo PUT /api/me); onAuthStateChanged
      // se po reload() ne sproži (research R-04).
      try {
        await user.getIdToken(true);
      } catch (error) {
        throw toSignInError(error);
      }
      const verified = toAuthUser(user);
      for (const listener of [...listeners]) listener(verified);
      return true;
    },
    async sendPasswordReset(email) {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (error) {
        const code = signInErrorCode(firebaseCode(error), navigator.onLine);
        // Vse drugo (neobstoječ račun, neveljaven naslov) je za uporabnika uspeh: enako potrdilo (FR-017-07).
        if (code === 'offline' || code === 'too-many-requests') throw new SignInError(code);
      }
    },
    async reauthenticate(password) {
      const user = current();
      try {
        if (password !== undefined) {
          if (!user.email) throw new SignInError('failed');
          await reauthenticateWithCredential(
            user,
            EmailAuthProvider.credential(user.email, password),
          );
        } else {
          await reauthenticateWithPopup(user, new GoogleAuthProvider());
        }
        return await user.getIdToken(true);
      } catch (error) {
        throw error instanceof SignInError ? error : toSignInError(error);
      }
    },
    async linkPassword(password) {
      const user = current();
      const { uid, email } = user;
      if (!email) throw new SignInError('failed');
      // Pravi projekt (z EEP): `accounts:signUp` z idToken (research R-03), ne `accounts:update` in ne
      // `linkWithCredential`. Emulator EEP ne posnema in `signUp` z idToken zavrne z EMAIL_EXISTS, zato testi in E2E
      // uporabijo `accounts:update`; produkcijska pot se preveri ročno (T024).
      const emulator = env.VITE_FIREBASE_EMULATOR !== 'false';
      const base = emulator
        ? `${window.location.origin}/identitytoolkit.googleapis.com`
        : 'https://identitytoolkit.googleapis.com';
      const method = emulator ? 'accounts:update' : 'accounts:signUp';
      let response: Response;
      try {
        const idToken = await user.getIdToken(true);
        response = await fetch(
          `${base}/v1/${method}?key=${encodeURIComponent(auth.app.options.apiKey ?? '')}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              email,
              password,
              returnSecureToken: true,
            }),
          },
        );
      } catch (error) {
        throw error instanceof SignInError ? error : toSignInError(error);
      }
      const body = (await response.json().catch(() => ({}))) as {
        localId?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw restErrorCode(body.error?.message);
      if (body.localId !== uid) {
        await signOut(auth);
        throw new SignInError('failed');
      }
      // SDK ne more uvoziti žetonov iz REST odgovora: isti UID se znova prijavi z geslom (R-04).
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        throw toSignInError(error);
      }
      const linked = auth.currentUser;
      if (!linked || linked.uid !== uid) {
        await signOut(auth);
        throw new SignInError('failed');
      }
      try {
        await reload(linked);
        await linked.getIdToken(true);
      } catch (error) {
        throw toSignInError(error);
      }
      const result = toAuthUser(linked);
      // Dodajanje gesla lahko izbriše potrditev e-naslova (celotnega računa, tudi za Google). Sporočilo pošljemo
      // PREDEN poslušalci preklopijo na zaslon potrditve; neuspeh ne prekine povezovanja (uporabnik ga ponovi tam).
      if (!result.emailVerified) {
        try {
          await sendEmailVerification(linked);
        } catch {
          // Gumb *Ponovno pošlji* na zaslonu potrditve.
        }
      }
      for (const listener of [...listeners]) listener(result);
      return { verificationRequired: !result.emailVerified };
    },
    async changePassword(newPassword) {
      const user = current();
      try {
        await updatePassword(user, newPassword);
        // Nov žeton po spremembi gesla (Firebase razveljavi druge seje); neuspeh osvežitve ni neuspeh spremembe.
        await user.getIdToken(true).catch(() => undefined);
      } catch (error) {
        throw toSignInError(error);
      }
    },
    async linkGoogle() {
      const user = current();
      try {
        await linkWithPopup(user, new GoogleAuthProvider());
        await reload(user);
      } catch (error) {
        throw toSignInError(error);
      }
      const result = toAuthUser(user);
      for (const listener of [...listeners]) listener(result);
    },
    signOut() {
      return signOut(auth);
    },
    async getIdToken() {
      const user = auth.currentUser;
      return user ? user.getIdToken() : null;
    },
  };
}
