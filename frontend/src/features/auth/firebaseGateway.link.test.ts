import type { Auth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from './AuthGateway';
import { createFirebaseGateway } from './firebaseGateway';

// Povezovanje ponudnikov (FR-017-09 … 11, research R-03, R-04): REST accounts:signUp z idToken (ne accounts:update,
// ne linkWithCredential), preverba UID pred in po, osvežitev stanja.
const sdk = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  linkWithPopup: vi.fn(),
  reload: vi.fn(),
  signOut: vi.fn(),
  linkWithCredential: vi.fn(),
}));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({
  connectAuthEmulator: vi.fn(),
  getAuth: vi.fn(),
  GoogleAuthProvider: class {
    providerId = 'google.com';
  },
  EmailAuthProvider: { credential: vi.fn() },
  onAuthStateChanged: vi.fn(() => () => undefined),
  signInWithEmailAndPassword: sdk.signInWithEmailAndPassword,
  linkWithPopup: sdk.linkWithPopup,
  linkWithCredential: sdk.linkWithCredential,
  reload: sdk.reload,
  signOut: sdk.signOut,
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  signInWithPopup: vi.fn(),
}));

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
    displayName: 'Ana',
    emailVerified: true,
    providerData: [{ providerId: 'google.com' }],
    getIdToken: vi.fn(() => Promise.resolve('fresh-token')),
    ...overrides,
  };
}

function setup(user: FakeUser | null) {
  const auth = { currentUser: user, app: { options: { apiKey: 'api-key' } } } as unknown as Auth & {
    currentUser: FakeUser | null;
  };
  const gateway = createFirebaseGateway(auth);
  const seen: (AuthUser | null)[] = [];
  gateway.onChange((next) => seen.push(next));
  seen.length = 0;
  return { gateway, auth, seen };
}

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('firebaseGateway – povezovanje', () => {
  it('FR-017-10: REST accounts:signUp z idToken, e-naslovom računa in geslom; ne accounts:update', async () => {
    const user = fakeUser();
    const { gateway, auth } = setup(user);
    reply(200, { localId: 'uid-ana' });
    sdk.signInWithEmailAndPassword.mockImplementation(() => {
      auth.currentUser = fakeUser({
        providerData: [{ providerId: 'google.com' }, { providerId: 'password' }],
      });
      return Promise.resolve();
    });

    await gateway.linkPassword('testno-geslo');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=api-key');
    expect(url).not.toContain('accounts:update');
    expect(JSON.parse(init.body as string)).toEqual({
      idToken: 'fresh-token',
      email: 'ana@primer.si',
      password: 'testno-geslo',
      returnSecureToken: true,
    });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(sdk.linkWithCredential).not.toHaveBeenCalled();
    expect(sdk.signInWithEmailAndPassword).toHaveBeenCalledWith(
      auth,
      'ana@primer.si',
      'testno-geslo',
    );
  });

  it('FR-017-10: po povezovanju poslušalci dobijo istega uporabnika z ponudnikom password', async () => {
    const { gateway, auth, seen } = setup(fakeUser());
    reply(200, { localId: 'uid-ana' });
    sdk.signInWithEmailAndPassword.mockImplementation(() => {
      auth.currentUser = fakeUser({
        providerData: [{ providerId: 'google.com' }, { providerId: 'password' }],
      });
      return Promise.resolve();
    });

    await gateway.linkPassword('testno-geslo');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      uid: 'uid-ana',
      emailVerified: true,
      providers: ['google.com', 'password'],
    });
  });

  it('FR-017-10: neujemanje UID v odgovoru → odjava in napaka, brez ponovne prijave', async () => {
    const { gateway, seen } = setup(fakeUser());
    reply(200, { localId: 'uid-drugi' });

    await expect(gateway.linkPassword('testno-geslo')).rejects.toMatchObject({ code: 'failed' });

    expect(sdk.signOut).toHaveBeenCalled();
    expect(sdk.signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });

  it('FR-017-10: neujemanje UID po ponovni prijavi → odjava in napaka', async () => {
    const { gateway, auth, seen } = setup(fakeUser());
    reply(200, { localId: 'uid-ana' });
    sdk.signInWithEmailAndPassword.mockImplementation(() => {
      auth.currentUser = fakeUser({ uid: 'uid-nov' });
      return Promise.resolve();
    });

    await expect(gateway.linkPassword('testno-geslo')).rejects.toMatchObject({ code: 'failed' });

    expect(sdk.signOut).toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });

  it('FR-017-11: email_verified=false po povezovanju – uporabnik s emailVerified=false gre na zaslon potrditve', async () => {
    const { gateway, auth, seen } = setup(fakeUser());
    reply(200, { localId: 'uid-ana' });
    sdk.signInWithEmailAndPassword.mockImplementation(() => {
      auth.currentUser = fakeUser({
        emailVerified: false,
        providerData: [{ providerId: 'password' }],
      });
      return Promise.resolve();
    });

    await gateway.linkPassword('testno-geslo');

    expect(seen[0]).toMatchObject({ emailVerified: false });
  });

  it.each([
    ['WEAK_PASSWORD : Password should be at least 6 characters', 'weak-password'],
    ['CREDENTIAL_TOO_OLD_LOGIN_AGAIN', 'requires-recent-login'],
    ['EMAIL_EXISTS', 'credential-in-use'],
    ['NEKAJ_DRUGEGA', 'failed'],
  ])('FR-017-10: napaka strežnika %s → %s, nič se ne spremeni', async (message, code) => {
    const { gateway, seen } = setup(fakeUser());
    reply(400, { error: { message } });

    await expect(gateway.linkPassword('testno-geslo')).rejects.toMatchObject({ code });

    expect(sdk.signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });

  it('FR-017-10: brez povezave → offline', async () => {
    const { gateway } = setup(fakeUser());
    vi.stubGlobal('navigator', { onLine: false });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(gateway.linkPassword('testno-geslo')).rejects.toMatchObject({
      code: 'offline',
    });
  });

  it('FR-017-09: linkGoogle uporabi linkWithPopup, osveži in obvesti poslušalce', async () => {
    const user = fakeUser({ providerData: [{ providerId: 'password' }] });
    const { gateway, seen } = setup(user);
    sdk.linkWithPopup.mockImplementation(() => {
      user.providerData.push({ providerId: 'google.com' });
      return Promise.resolve();
    });

    await gateway.linkGoogle();

    expect(sdk.linkWithPopup).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ providerId: 'google.com' }),
    );
    expect(seen[0]).toMatchObject({ providers: ['password', 'google.com'] });
  });

  it('FR-017-09: Google račun že pri drugem računu → credential-in-use, brez združevanja', async () => {
    const { gateway, seen } = setup(fakeUser({ providerData: [{ providerId: 'password' }] }));
    sdk.linkWithPopup.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'auth/credential-already-in-use' }),
    );

    await expect(gateway.linkGoogle()).rejects.toMatchObject({ code: 'credential-in-use' });
    expect(seen).toHaveLength(0);
  });
});
