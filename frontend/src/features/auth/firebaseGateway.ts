import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

import { type AuthGateway, SignInError } from './AuthGateway';
import { signInErrorCode } from './signInErrorCode';

const env = import.meta.env;

function firebaseCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

/**
 * Izvedba AuthGateway s Firebase JS SDK (research R-04): prijava z Googlom v pojavnem oknu, obstojnost v IndexedDB
 * (deli se med zavihki). Privzeto demo projekt in emulator na istem izvoru (nginx ali Vite ga posredujeta).
 */
export function createFirebaseGateway(): AuthGateway {
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

  return {
    onChange(listener) {
      return onAuthStateChanged(auth, (user) =>
        listener(user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null),
      );
    },
    async signInWithGoogle() {
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (error) {
        throw new SignInError(signInErrorCode(firebaseCode(error), navigator.onLine));
      }
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
