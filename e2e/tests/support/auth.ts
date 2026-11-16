import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Prijava prek pojavnega okna Firebase Auth Emulatorja (research R-09). Okno je del emulatorja, ne aplikacije,
// zato njegova imena niso v plan.md; iščejo se po vlogah in oznakah okna emulatorja.

export interface TestUser {
  email: string;
  name: string;
}

/** Nov uporabnik z edinstvenim e-naslovom (emulator in baza sta skupna vsem testom). */
export function uniqueUser(name = 'Ana Novak'): TestUser {
  return { email: `e2e-${randomUUID()}@primer.si`, name };
}

/** Klikne »Prijava z Googlom« (sl ali en) in v oknu emulatorja izbere obstoječ račun ali ga ustvari. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  const popupOpened = page.waitForEvent('popup');
  await page.getByRole('button', { name: /^(Prijava z Googlom|Sign in with Google)$/ }).click();
  const popup = await popupOpened;
  await popup.waitForLoadState();
  const popupClosed = popup.waitForEvent('close');

  const existing = popup.getByRole('listitem').filter({ hasText: user.email });
  if ((await existing.count()) > 0) {
    await existing.first().click();
  } else {
    await popup.getByRole('button', { name: 'Add new account' }).click();
    await popup.getByLabel('Email', { exact: true }).fill(user.email);
    await popup.getByLabel('Display name', { exact: true }).fill(user.name);
    const submit = popup.getByRole('button', { name: /Sign in with Google/ });
    await expect(submit).toBeEnabled();
    await submit.click();
  }
  await popupClosed;
}

// 017: prijava z e-naslovom in geslom. Sporočila (potrditev, ponastavitev) emulator ne pošilja: kode OOB so na
// `/emulator/v1/projects/{p}/oobCodes` (nginx jih posreduje emulatorju), uporabijo se z REST klicem, ki ga sicer naredi
// stran povezave v sporočilu. Imena elementov so zbrana tu (vir: frontend/src/i18n/sl.json, `auth.*`).

const PROJECT_ID = 'demo-contact-manager';
const API_KEY = 'demo-api-key';

export const PASSWORD_NAMES = {
  email: 'E-naslov',
  password: 'Geslo',
  passwordConfirm: 'Ponovi geslo',
  signInWithPassword: 'Prijava z geslom',
  forgot: 'Pozabljeno geslo?',
  register: 'Ustvari račun z e-naslovom',
  registerHeading: 'Ustvari račun',
  registerSubmit: 'Ustvari račun',
  verifyHeading: 'Potrdi e-naslov',
  verifyConfirm: 'Potrdil sem',
  verifyResend: 'Ponovno pošlji',
  verifySignOut: 'Odjava',
  verifySent: 'Sporočilo za potrditev je poslano.',
  verifyNotYet: 'E-naslov še ni potrjen. Odpri povezavo v sporočilu in poskusi znova.',
  invalidCredentials: 'E-naslov ali geslo ni pravilno.',
  emailInUse:
    'Registracija s tem e-naslovom ni mogoča. Če že imaš račun, se prijavi (z Googlom ali geslom) ali ponastavi geslo; geslo lahko nato dodaš v Mojem računu.',
  forgotHeading: 'Pozabljeno geslo',
  forgotSubmit: 'Pošlji povezavo',
  forgotSent:
    'Če račun s tem e-naslovom obstaja, smo nanj poslali sporočilo s povezavo za novo geslo.',
  forgotBack: 'Nazaj na prijavo',
} as const;

/** Geslo za testni račun (najmanj 8 znakov). */
export function testPassword(): string {
  return `Geslo-${randomUUID().slice(0, 8)}`;
}

/** Registracija prek strani `/register`; po njej je prikazan zaslon potrditve. */
export async function registerWithPassword(page: Page, email: string, password: string) {
  await page.getByLabel(PASSWORD_NAMES.email, { exact: true }).fill(email);
  await page.getByLabel(PASSWORD_NAMES.password, { exact: true }).fill(password);
  await page.getByLabel(PASSWORD_NAMES.passwordConfirm, { exact: true }).fill(password);
  await page.getByRole('button', { name: PASSWORD_NAMES.registerSubmit }).click();
}

/** Prijava z geslom na strani `/login`. */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.getByLabel(PASSWORD_NAMES.email, { exact: true }).fill(email);
  await page.getByLabel(PASSWORD_NAMES.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: PASSWORD_NAMES.signInWithPassword }).click();
}

type OobRequestType = 'VERIFY_EMAIL' | 'PASSWORD_RESET';

/** Zadnja koda OOB dane vrste za e-naslov (čaka, da jo emulator zabeleži). */
async function latestOobCode(
  request: APIRequestContext,
  email: string,
  requestType: OobRequestType,
): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(`/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
      const body = (await response.json()) as {
        oobCodes: { email: string; oobCode: string; requestType: string }[];
      };
      code = body.oobCodes
        .filter(
          (c) => c.email.toLowerCase() === email.toLowerCase() && c.requestType === requestType,
        )
        .at(-1)?.oobCode;
      return code;
    })
    .toBeTruthy();
  return code!;
}

async function identityToolkit(request: APIRequestContext, method: string, data: object) {
  const response = await request.post(
    `/identitytoolkit.googleapis.com/v1/${method}?key=${API_KEY}`,
    { data },
  );
  expect(response.ok(), `${method}: ${await response.text()}`).toBe(true);
  return (await response.json()) as Record<string, unknown>;
}

/** Uporabnik odpre povezavo za potrditev iz sporočila (npr. v drugem zavihku). */
export async function verifyEmailFromInbox(request: APIRequestContext, email: string) {
  const oobCode = await latestOobCode(request, email, 'VERIFY_EMAIL');
  await identityToolkit(request, 'accounts:update', { oobCode });
}

/** Uporabnik odpre povezavo za ponastavitev gesla in vpiše novo geslo. */
export async function resetPasswordFromInbox(
  request: APIRequestContext,
  email: string,
  newPassword: string,
) {
  const oobCode = await latestOobCode(request, email, 'PASSWORD_RESET');
  await identityToolkit(request, 'accounts:resetPassword', { oobCode, newPassword });
}

/** Ali je emulator zabeležil kodo za ponastavitev gesla za ta e-naslov (brez čakanja). */
export async function hasPasswordResetCode(request: APIRequestContext, email: string) {
  const response = await request.get(`/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const body = (await response.json()) as { oobCodes: { email: string; requestType: string }[] };
  return body.oobCodes.some(
    (c) => c.email.toLowerCase() === email.toLowerCase() && c.requestType === 'PASSWORD_RESET',
  );
}

/** ID žeton računa z geslom neposredno od emulatorja (za klic API mimo vmesnika). */
export async function passwordIdToken(request: APIRequestContext, email: string, password: string) {
  const body = await identityToolkit(request, 'accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
  return body.idToken as string;
}

/** Račun z geslom in potrjenim e-naslovom, ustvarjen neposredno pri emulatorju (priprava testa prijave). */
export async function createVerifiedPasswordAccount(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const body = await identityToolkit(request, 'accounts:signUp', {
    email,
    password,
    returnSecureToken: true,
  });
  await identityToolkit(request, 'accounts:sendOobCode', {
    requestType: 'VERIFY_EMAIL',
    idToken: body.idToken,
  });
  await verifyEmailFromInbox(request, email);
}
