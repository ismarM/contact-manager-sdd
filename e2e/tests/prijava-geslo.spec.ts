import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import {
  createVerifiedPasswordAccount,
  reauthenticateWithGoogle,
  hasPasswordResetCode,
  PASSWORD_NAMES as N,
  passwordIdToken,
  registerWithPassword,
  resetPasswordFromInbox,
  signIn,
  signInWithPassword,
  testPassword,
  uniqueUser,
  verifyEmailFromInbox,
} from './support/auth';
import { createGroup } from './support/groups';
import { NAMES as APP_PASSWORD } from './support/importExport';
import { addReceivedInvitation, userExists } from './support/myData';

// 017 prijava z e-pošto in geslom (plan.md – Pages and routes): /register, /verify-email, /forgot-password, /login.
// Teče pri 360 in 1280 px (playwright.config.ts). Sporočila zamenjajo kode OOB emulatorja (support/auth.ts).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const accountMenu = (page: Page) => page.getByRole('button', { name: 'Meni računa' });

async function signOut(page: Page) {
  await accountMenu(page).click();
  await page.getByRole('menuitem', { name: 'Odjava' }).click();
  await expect(page.getByRole('button', { name: 'Prijava z Googlom' })).toBeVisible();
}

test.use({ locale: 'sl-SI' });

test('FR-017-01 FR-017-02 FR-017-03 FR-017-04 FR-017-13: registracija, 403 pred potrditvijo, vstop po potrditvi brez ponovne prijave, povabilo šele potem', async ({
  page,
  browser,
  request,
}) => {
  // Vabilec (Google) ima skupino; povabilo je mogoče šele, ko ima povabljeni profil.
  const inviter = uniqueUser('Vabilec Vid');
  const inviterContext = await browser.newContext({ locale: 'sl-SI' });
  const inviterPage = await inviterContext.newPage();
  await inviterPage.goto('/');
  await signIn(inviterPage, inviter);
  await expect(accountMenu(inviterPage)).toBeVisible();
  const groupId = await createGroup(inviterPage, { title: 'Projekt 017' });
  await inviterContext.close();

  const email = uniqueUser().email;
  const password = testPassword();
  await page.goto('/login');
  await page.getByRole('link', { name: N.register }).click();
  await expect(page.getByRole('heading', { level: 1, name: N.registerHeading })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await registerWithPassword(page, email, password);

  await expect(page.getByRole('heading', { level: 1, name: N.verifyHeading })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/verify-email');
  await expect(page.getByRole('main')).toContainText(email);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Zaledje: nepotrjen žeton dobi 403 EMAIL_NOT_VERIFIED in profil ne nastane.
  const unverifiedToken = await passwordIdToken(request, email, password);
  const forbidden = await request.put('/api/me', {
    headers: { Authorization: `Bearer ${unverifiedToken}` },
  });
  expect(forbidden.status()).toBe(403);
  expect(await forbidden.json()).toEqual({ code: 'EMAIL_NOT_VERIFIED' });
  expect(userExists(email)).toBe(false);

  await page.getByRole('button', { name: N.verifyResend }).click();
  await expect(page.getByRole('status')).toHaveText(N.verifySent);
  await page.getByRole('button', { name: N.verifyConfirm }).click();
  await expect(page.getByRole('alert')).toHaveText(N.verifyNotYet);
  await page.goto('/invitations');
  await expect(page.getByRole('heading', { level: 1, name: N.verifyHeading })).toBeVisible();

  await verifyEmailFromInbox(request, email);
  await page.getByRole('button', { name: N.verifyConfirm }).click();

  await expect(accountMenu(page)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/invitations');
  expect(userExists(email)).toBe(true);

  addReceivedInvitation(groupId, email, inviter.email);
  await page.reload();
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Projekt 017' }) }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-017-05 FR-017-06: prijava z geslom vodi na next; napačno geslo in neobstoječ račun dobita isto sporočilo', async ({
  page,
  request,
}) => {
  const email = uniqueUser().email;
  const password = testPassword();
  await createVerifiedPasswordAccount(request, email, password);

  await page.goto('/account?x=1');
  await expect(page.getByRole('button', { name: N.signInWithPassword })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await signInWithPassword(page, email, `${password}-napacno`);
  await expect(page.getByRole('alert')).toHaveText(N.invalidCredentials);
  await expectNoAxeViolations(page);

  await page.reload();
  await signInWithPassword(page, uniqueUser().email, password);
  await expect(page.getByRole('alert')).toHaveText(N.invalidCredentials);

  await page.reload();
  await signInWithPassword(page, email, password);
  await expect(page.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/account?x=1');
  await expect(page.getByRole('main')).toContainText(email);
});

test('FR-017-07: pozabljeno geslo – isto potrdilo za obstoječ in neobstoječ račun, novo geslo deluje', async ({
  page,
  request,
}) => {
  const email = uniqueUser().email;
  const unknown = uniqueUser().email;
  await createVerifiedPasswordAccount(request, email, testPassword());

  await page.goto('/login');
  await page.getByRole('link', { name: N.forgot }).click();
  await expect(page.getByRole('heading', { level: 1, name: N.forgotHeading })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByLabel(N.email, { exact: true }).fill(unknown);
  await page.getByRole('button', { name: N.forgotSubmit }).click();
  await expect(page.getByRole('status')).toHaveText(N.forgotSent);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.reload();
  await page.getByLabel(N.email, { exact: true }).fill(email);
  await page.getByRole('button', { name: N.forgotSubmit }).click();
  await expect(page.getByRole('status')).toHaveText(N.forgotSent);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await hasPasswordResetCode(request, unknown)).toBe(false);

  const newPassword = testPassword();
  await resetPasswordFromInbox(request, email, newPassword);
  await page.getByRole('link', { name: N.forgotBack }).click();
  await expect(page.getByRole('button', { name: N.signInWithPassword })).toBeVisible();
  await signInWithPassword(page, email, newPassword);
  await expect(accountMenu(page)).toBeVisible();
});

test('FR-017-08 SC-002: Google prijava obstoječega uporabnika ohrani skupine, nastavitve in gesla za aplikacijo', async ({
  page,
}) => {
  const user = uniqueUser('Gregor Google');
  await page.goto('/');
  await signIn(page, user);
  await expect(accountMenu(page)).toBeVisible();
  await createGroup(page, { title: 'Obstoječa skupina' });
  await page.goto('/account');
  await page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: 'Temna' }).check();
  await page.getByRole('button', { name: APP_PASSWORD.newPassword }).click();
  await page.getByLabel(APP_PASSWORD.deviceName).fill('Telefon');
  await page.getByRole('button', { name: APP_PASSWORD.createPassword }).click();
  await page.getByRole('dialog').getByRole('button', { name: APP_PASSWORD.close }).click();
  await signOut(page);

  await signIn(page, user);

  await expect(accountMenu(page)).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Obstoječa skupina' }),
  ).toBeVisible();
  await page.goto('/account');
  await expect(
    page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: 'Temna' }),
  ).toBeChecked();
  await expect(page.getByRole('button', { name: APP_PASSWORD.revoke('Telefon') })).toBeVisible();
});

const methods = (page: Page) => page.getByRole('region', { name: 'Prijavne metode' });

test('FR-017-09 FR-017-10 FR-017-11: Google uporabnik doda geslo – opozorilo vnaprej, potrditveno sporočilo, vstop z Googlom in geslom, iste skupine, en profil', async ({
  page,
  request,
}) => {
  const user = uniqueUser('Gaja Google');
  const password = testPassword();
  await page.goto('/');
  await signIn(page, user);
  await expect(accountMenu(page)).toBeVisible();
  await createGroup(page, { title: 'Skupina pred geslom' });
  await page.goto('/account');
  await expect(methods(page)).toContainText('E-naslov in geslo: ni povezano');

  // Pravi Firebase (EEP) ob dodajanju gesla ponastavi potrditev e-naslova; emulator tega ne stori sam, zato
  // administrator takoj po odgovoru postavi emailVerified=false (samo za ta UID).
  await page.route('**/accounts:update*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { localId?: string };
    if (body.localId) {
      const reset = await request.post(
        '/identitytoolkit.googleapis.com/v1/projects/demo-contact-manager/accounts:update',
        {
          headers: { Authorization: 'Bearer owner' },
          data: { localId: body.localId, emailVerified: false },
        },
      );
      expect(reset.ok()).toBe(true);
    }
    await route.fulfill({ response });
  });

  await methods(page).getByRole('button', { name: 'Omogoči prijavo z geslom' }).click();
  await expect(methods(page).getByLabel(N.email, { exact: true })).toHaveAttribute('readonly', '');
  await expect(methods(page).getByLabel(N.email, { exact: true })).toHaveValue(user.email);
  await expect(methods(page).getByRole('note')).toContainText(
    'po dodajanju gesla zahteva, da znova potrdiš e-naslov',
  );
  await expectNoAxeViolations(page);
  await methods(page).getByLabel(N.password, { exact: true }).fill(password);
  await methods(page).getByLabel(N.passwordConfirm, { exact: true }).fill(password);
  await methods(page)
    .getByRole('checkbox', { name: /imam dostop do svojega e-poštnega predala/ })
    .check();
  await reauthenticateWithGoogle(page, user, () =>
    methods(page).getByRole('button', { name: 'Omogoči prijavo z geslom' }).click(),
  );

  // Uporabnik ni zaklenjen brez pojasnila: zaslon potrditve pove, kaj se je zgodilo, sporočilo je že poslano.
  await expect(page.getByRole('heading', { level: 1, name: N.verifyHeading })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Račun, skupine in podatki so nespremenjeni.');
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  expect(userExists(user.email)).toBe(true);
  await page.getByRole('button', { name: N.verifyResend }).click();
  await expect(page.getByRole('status')).toHaveText(N.verifySent);

  await verifyEmailFromInbox(request, user.email);
  await page.getByRole('button', { name: N.verifyConfirm }).click();
  await expect(accountMenu(page)).toBeVisible();
  await page.unroute('**/accounts:update*');
  await page.goto('/account');
  await expect(methods(page)).toContainText('E-naslov in geslo: povezano');
  await signOut(page);

  // Regresija: obstoječi Google uporabnik po dodajanju gesla in odjavi znova vstopi z Googlom in vidi skupine.
  await signIn(page, user);
  await expect(accountMenu(page)).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Skupina pred geslom' }),
  ).toBeVisible();
  await signOut(page);

  await page.goto('/login');
  await signInWithPassword(page, user.email, password);
  await expect(accountMenu(page)).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Skupina pred geslom' }),
  ).toBeVisible();
  expect(userExists(user.email)).toBe(true);
  await signOut(page);

  await page.goto('/register');
  await registerWithPassword(page, user.email, testPassword());
  await expect(page.getByRole('alert')).toHaveText(N.emailInUse);
  expect(userExists(user.email)).toBe(true);
});

test('FR-017-12: izbris računa z geslom zahteva geslo; napačno geslo ne spremeni ničesar', async ({
  page,
  request,
}) => {
  const email = uniqueUser().email;
  const password = testPassword();
  await createVerifiedPasswordAccount(request, email, password);
  await page.goto('/login');
  await signInWithPassword(page, email, password);
  await expect(accountMenu(page)).toBeVisible();
  await page.goto('/account');
  const section = page.getByRole('region', { name: 'Izbris računa' });
  await section.getByRole('button', { name: 'Izbriši račun' }).click();
  const dialog = page.getByRole('dialog', { name: 'Izbrišem račun?' });
  await dialog.getByRole('textbox', { name: 'Za potrditev vpiši svoj e-naslov' }).fill(email);
  await dialog.getByLabel('Za potrditev vpiši svoje geslo').fill(`${password}-napacno`);
  await expectNoAxeViolations(page);

  await dialog.getByRole('button', { name: 'Izbriši račun' }).click();

  await expect(dialog.getByLabel('Za potrditev vpiši svoje geslo')).toHaveAccessibleDescription(
    N.invalidCredentials,
  );
  expect(userExists(email)).toBe(true);
  await expectNoAxeViolations(page);

  await dialog.getByLabel('Za potrditev vpiši svoje geslo').fill(password);
  await dialog.getByRole('button', { name: 'Izbriši račun' }).click();

  await expect(page).toHaveURL(/\/login\?reason=account-deleted$/);
  expect(userExists(email)).toBe(false);
});

test('FR-017-24: sprememba gesla v Mojem računu – ponovna avtentikacija, staro geslo ne deluje več, novo deluje, isti račun', async ({
  page,
  request,
}) => {
  const email = uniqueUser().email;
  const password = testPassword();
  const newPassword = testPassword();
  await createVerifiedPasswordAccount(request, email, password);
  await page.goto('/login');
  await signInWithPassword(page, email, password);
  await expect(accountMenu(page)).toBeVisible();
  await page.goto('/account');
  await expect(methods(page).getByRole('button', { name: 'Omogoči prijavo z geslom' })).toHaveCount(
    0,
  );

  await methods(page).getByRole('button', { name: 'Spremeni geslo' }).click();
  await methods(page).getByLabel('Trenutno geslo').fill(password);
  await methods(page).getByLabel('Novo geslo', { exact: true }).fill(newPassword);
  await methods(page).getByLabel('Ponovi novo geslo').fill(newPassword);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await methods(page).getByRole('button', { name: 'Spremeni geslo' }).click();

  await expect(methods(page).getByRole('status')).toContainText('Geslo je spremenjeno.');
  expect(userExists(email)).toBe(true);
  await signOut(page);

  await signInWithPassword(page, email, password);
  await expect(page.getByRole('alert')).toHaveText(N.invalidCredentials);
  await page.reload();
  await signInWithPassword(page, email, newPassword);
  await expect(accountMenu(page)).toBeVisible();
});
