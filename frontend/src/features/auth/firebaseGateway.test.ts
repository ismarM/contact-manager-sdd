import type { Auth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AuthUser, SignInError } from './AuthGateway';
import { createFirebaseGateway } from './firebaseGateway';

// Lažni Firebase SDK (research R-04, R-05): preverja zaporedje klicev in preslikavo napak brez nalaganja SDK.
const sdk = vi.hoisted(() => ({
  calls: [] as string[],
  authListener: null as ((user: unknown) => void) | null,
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  reload: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({
  connectAuthEmulator: vi.fn(),
  getAuth: vi.fn(),
  GoogleAuthProvider: class {
    providerId = 'google.com';
  },
  EmailAuthProvider: {
    credential: (email: string, password: string) => ({ email, password }),
  },
  onAuthStateChanged: (_auth: unknown, listener: (user: unknown) => void) => {
    sdk.authListener = listener;
    return () => {
      sdk.authListener = null;
    };
  },
  createUserWithEmailAndPassword: sdk.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: sdk.signInWithEmailAndPassword,
  sendEmailVerification: sdk.sendEmailVerification,
  sendPasswordResetEmail: sdk.sendPasswordResetEmail,
  reload: sdk.reload,
  reauthenticateWithCredential: sdk.reauthenticateWithCredential,
  reauthenticateWithPopup: sdk.reauthenticateWithPopup,
  signInWithPopup: sdk.signInWithPopup,
  signOut: sdk.signOut,
  updatePassword: vi.fn(),
  linkWithPopup: vi.fn(),
}));

function firebaseError(code: string) {
  return Object.assign(new Error(code), { code });
}

interface FakeUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  providerData: { providerId: string }[];
  getIdToken: ReturnType<typeof vi.fn>;
}

function fakeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    uid: 'uid-ana',
    email: 'ana@primer.si',
    displayName: null,
    emailVerified: false,
    providerData: [{ providerId: 'password' }],
    getIdToken: vi.fn((force?: boolean) => {
      sdk.calls.push(`getIdToken(${force === true})`);
      return Promise.resolve(force ? 'fresh-token' : 'cached-token');
    }),
    ...overrides,
  };
}

function setup(user: FakeUser | null) {
  const auth = { currentUser: user } as unknown as Auth;
  const gateway = createFirebaseGateway(auth);
  const seen: (AuthUser | null)[] = [];
  gateway.onChange((next) => {
    sdk.calls.push('listener');
    seen.push(next);
  });
  return { gateway, seen, auth };
}

beforeEach(() => {
  sdk.calls.length = 0;
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('firebaseGateway', () => {
  it('FR-017-02: poslušalec dobi stanje potrditve in povezane ponudnike', () => {
    const { seen } = setup(null);
    sdk.authListener?.(
      fakeUser({
        providerData: [{ providerId: 'google.com' }, { providerId: 'password' }],
        emailVerified: true,
      }),
    );
    sdk.authListener?.(null);

    expect(seen).toEqual([
      {
        uid: 'uid-ana',
        email: 'ana@primer.si',
        displayName: null,
        emailVerified: true,
        providers: ['google.com', 'password'],
        hasPhotoUrl: false,
      },
      null,
    ]);
  });

  it('FR-017-13: po potrditvi reload → getIdToken(true) → šele nato poslušalci', async () => {
    const user = fakeUser();
    sdk.reload.mockImplementation(() => {
      sdk.calls.push('reload');
      user.emailVerified = true;
      return Promise.resolve();
    });
    const { gateway, seen } = setup(user);

    await expect(gateway.refreshVerification()).resolves.toBe(true);

    expect(sdk.calls).toEqual(['reload', 'getIdToken(true)', 'listener']);
    expect(seen.at(-1)).toMatchObject({ uid: 'uid-ana', emailVerified: true });
  });

  it('FR-017-13: še nepotrjen e-naslov – brez novega žetona in brez obvestila', async () => {
    const user = fakeUser();
    sdk.reload.mockResolvedValue(undefined);
    const { gateway, seen } = setup(user);

    await expect(gateway.refreshVerification()).resolves.toBe(false);

    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('FR-017-01: registracija ustvari račun in pošlje potrditveno sporočilo', async () => {
    const user = fakeUser();
    sdk.createUserWithEmailAndPassword.mockResolvedValue({ user });
    sdk.sendEmailVerification.mockResolvedValue(undefined);
    const { gateway, auth } = setup(null);

    await gateway.signUpWithPassword('ana@primer.si', 'geslo-1234');

    expect(sdk.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      auth,
      'ana@primer.si',
      'geslo-1234',
    );
    expect(sdk.sendEmailVerification).toHaveBeenCalledWith(user);
  });

  it('FR-017-03: neuspelo pošiljanje ob registraciji ne prekine registracije', async () => {
    sdk.createUserWithEmailAndPassword.mockResolvedValue({ user: fakeUser() });
    sdk.sendEmailVerification.mockRejectedValue(firebaseError('auth/too-many-requests'));
    const { gateway } = setup(null);

    await expect(
      gateway.signUpWithPassword('ana@primer.si', 'geslo-1234'),
    ).resolves.toBeUndefined();
  });

  it('FR-017-10: obstoječ e-naslov ob registraciji → email-in-use, sporočilo se ne pošlje', async () => {
    sdk.createUserWithEmailAndPassword.mockRejectedValue(
      firebaseError('auth/email-already-in-use'),
    );
    const { gateway } = setup(null);

    await expect(gateway.signUpWithPassword('ana@primer.si', 'geslo-1234')).rejects.toEqual(
      new SignInError('email-in-use'),
    );
    expect(sdk.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('FR-017-03: ponovno pošiljanje z omejitvijo pogostosti → too-many-requests', async () => {
    sdk.sendEmailVerification.mockRejectedValue(firebaseError('auth/too-many-requests'));
    const { gateway } = setup(fakeUser());

    await expect(gateway.sendVerificationEmail()).rejects.toMatchObject({
      code: 'too-many-requests',
    });
  });

  it.each(['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'])(
    'FR-017-06: prijava z geslom, %s → ena koda invalid-credentials',
    async (code) => {
      sdk.signInWithEmailAndPassword.mockRejectedValue(firebaseError(code));
      const { gateway } = setup(null);

      await expect(gateway.signInWithPassword('ana@primer.si', 'napacno')).rejects.toMatchObject({
        code: 'invalid-credentials',
      });
    },
  );

  it.each(['auth/user-not-found', 'auth/invalid-email', 'auth/internal-error'])(
    'FR-017-07: ponastavitev gesla z napako %s je za uporabnika uspeh',
    async (code) => {
      sdk.sendPasswordResetEmail.mockRejectedValue(firebaseError(code));
      const { gateway } = setup(null);

      await expect(gateway.sendPasswordReset('nihce@primer.si')).resolves.toBeUndefined();
    },
  );

  it('FR-017-07: ponastavitev gesla brez povezave → offline', async () => {
    sdk.sendPasswordResetEmail.mockRejectedValue(firebaseError('auth/network-request-failed'));
    const { gateway } = setup(null);

    await expect(gateway.sendPasswordReset('ana@primer.si')).rejects.toMatchObject({
      code: 'offline',
    });
  });

  it('FR-017-12: ponovna avtentikacija z geslom vrne svež žeton', async () => {
    const user = fakeUser({ emailVerified: true });
    sdk.reauthenticateWithCredential.mockImplementation(() => {
      sdk.calls.push('reauthenticate');
      return Promise.resolve({ user });
    });
    const { gateway } = setup(user);

    await expect(gateway.reauthenticate('geslo-1234')).resolves.toBe('fresh-token');

    expect(sdk.reauthenticateWithCredential).toHaveBeenCalledWith(user, {
      email: 'ana@primer.si',
      password: 'geslo-1234',
    });
    expect(sdk.reauthenticateWithPopup).not.toHaveBeenCalled();
    expect(sdk.calls).toEqual(['reauthenticate', 'getIdToken(true)']);
  });

  it('FR-017-12: ponovna avtentikacija brez gesla uporabi Google v pojavnem oknu', async () => {
    const user = fakeUser({ providerData: [{ providerId: 'google.com' }], emailVerified: true });
    sdk.reauthenticateWithPopup.mockResolvedValue({ user });
    const { gateway } = setup(user);

    await expect(gateway.reauthenticate()).resolves.toBe('fresh-token');

    expect(sdk.reauthenticateWithPopup).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ providerId: 'google.com' }),
    );
    expect(sdk.reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it('FR-017-12: napačno geslo pri ponovni avtentikaciji → invalid-credentials, brez novega žetona', async () => {
    const user = fakeUser({ emailVerified: true });
    sdk.reauthenticateWithCredential.mockRejectedValue(firebaseError('auth/wrong-password'));
    const { gateway } = setup(user);

    await expect(gateway.reauthenticate('napacno')).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
    expect(user.getIdToken).not.toHaveBeenCalled();
  });

  it('FR-017-12: ponovna avtentikacija brez prijavljenega uporabnika ne uspe', async () => {
    const { gateway } = setup(null);

    await expect(gateway.reauthenticate('geslo-1234')).rejects.toBeInstanceOf(SignInError);
    expect(sdk.reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});
