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
  sendEmailVerification: vi.fn(),
  updatePassword: vi.fn(),
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
  sendEmailVerification: sdk.sendEmailVerification,
  updatePassword: sdk.updatePassword,
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
  const auth = { currentUser: user, app: { options: { apiKey: 'api-key' } } } as unknown as {
    currentUser: FakeUser | null;
  };
  const gateway = createFirebaseGateway(auth as unknown as Auth);
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
  it('FR-017-10: emulator: REST accounts:update z idToken, e-naslovom računa in geslom (ne linkWithCredential)', async () => {
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
    expect(url).toContain('/identitytoolkit.googleapis.com/v1/accounts:update?key=api-key');
    expect(url).not.toContain('accounts:signUp');
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

  it('FR-017-11: ponastavljena potrditev → sporočilo se pošlje PRED obvestilom poslušalcev in rezultat zahteva potrditev', async () => {
    const order: string[] = [];
    const { gateway, auth } = setup(fakeUser());
    gateway.onChange(() => order.push('listener'));
    reply(200, { localId: 'uid-ana' });
    sdk.signInWithEmailAndPassword.mockImplementation(() => {
      auth.currentUser = fakeUser({
        emailVerified: false,
        providerData: [{ providerId: 'google.com' }, { providerId: 'password' }],
      });
      return Promise.resolve();
    });
    sdk.sendEmailVerification.mockImplementation(() => {
      order.push('mail');
      return Promise.resolve();
    });

    await expect(gateway.linkPassword('testno-geslo')).resolves.toEqual({
      verificationRequired: true,
    });

    expect(order).toEqual(['mail', 'listener']);
  });

  it('FR-017-11: potrditev ostane → sporočilo se ne pošlje, verificationRequired=false', async () => {
    const { gateway, auth } = setup(fakeUser());
    reply(200, { localId: 'uid-ana' });
    sdk.signInWithEmailAndPassword.mockImplementation(() => {
      auth.currentUser = fakeUser();
      return Promise.resolve();
    });

    await expect(gateway.linkPassword('testno-geslo')).resolves.toEqual({
      verificationRequired: false,
    });
    expect(sdk.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('FR-017-11: neuspelo pošiljanje sporočila ne prekine povezovanja (ponovno pošiljanje na zaslonu potrditve)', async () => {
    const { gateway, auth, seen } = setup(fakeUser());
    reply(200, { localId: 'uid-ana' });
    sdk.signInWithEmailAndPassword.mockImplementation(() => {
      auth.currentUser = fakeUser({ emailVerified: false });
      return Promise.resolve();
    });
    sdk.sendEmailVerification.mockRejectedValue(new Error('too many'));

    await expect(gateway.linkPassword('testno-geslo')).resolves.toEqual({
      verificationRequired: true,
    });
    expect(seen[0]).toMatchObject({ emailVerified: false });
  });

  it('FR-017-10: pravi projekt (z EEP): accounts:signUp z idToken na identitytoolkit.googleapis.com, ne accounts:update', async () => {
    vi.stubEnv('VITE_FIREBASE_EMULATOR', 'false');
    try {
      const { gateway, auth } = setup(fakeUser());
      reply(200, { localId: 'uid-ana' });
      sdk.signInWithEmailAndPassword.mockImplementation(() => {
        auth.currentUser = fakeUser();
        return Promise.resolve();
      });

      await gateway.linkPassword('testno-geslo');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=api-key');
      expect(JSON.parse(init.body as string)).toMatchObject({
        idToken: 'fresh-token',
        email: 'ana@primer.si',
      });
      expect(sdk.linkWithCredential).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
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

  it('FR-017-24: changePassword uporabi updatePassword v SDK in osveži žeton; geslo ne gre prek fetch', async () => {
    const user = fakeUser({ providerData: [{ providerId: 'password' }] });
    const { gateway } = setup(user);
    sdk.updatePassword.mockResolvedValue(undefined);

    await gateway.changePassword('novo-geslo-123');

    expect(sdk.updatePassword).toHaveBeenCalledWith(user, 'novo-geslo-123');
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['auth/requires-recent-login', 'requires-recent-login'],
    ['auth/weak-password', 'weak-password'],
    ['auth/password-does-not-meet-requirements', 'weak-password'],
    ['auth/network-request-failed', 'offline'],
  ])('FR-017-24: napaka %s pri spremembi gesla → %s', async (firebase, code) => {
    const { gateway } = setup(fakeUser({ providerData: [{ providerId: 'password' }] }));
    sdk.updatePassword.mockRejectedValue(Object.assign(new Error(firebase), { code: firebase }));
    vi.stubGlobal('navigator', { onLine: code !== 'offline' });

    await expect(gateway.changePassword('novo-geslo-123')).rejects.toMatchObject({ code });
  });

  it('FR-017-24: neuspela osvežitev žetona po spremembi ni neuspeh spremembe', async () => {
    const user = fakeUser({ providerData: [{ providerId: 'password' }] });
    user.getIdToken.mockRejectedValue(new Error('refresh'));
    const { gateway } = setup(user);
    sdk.updatePassword.mockResolvedValue(undefined);

    await expect(gateway.changePassword('novo-geslo-123')).resolves.toBeUndefined();
  });

  it('FR-017-24: brez prijavljenega uporabnika sprememba ne steče', async () => {
    const { gateway } = setup(null);

    await expect(gateway.changePassword('novo-geslo-123')).rejects.toMatchObject({
      code: 'failed',
    });
    expect(sdk.updatePassword).not.toHaveBeenCalled();
  });
});
