import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { createContactViaApi, idToken } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import { archive, createGroup, type Role, setRole } from './support/groups';
import { deleteContactViaApi, getContact } from './support/history';
import {
  chooseFile,
  cropWithKeyboardAndSave,
  JPEG,
  NOT_AN_IMAGE,
  PNG,
  PNG_ALPHA,
  photoLoaded,
  removePhoto,
  uploadDialog,
  uploadPhoto,
} from './support/images';
import { seedDuplicates } from './support/duplicates';

// 018 slike (plan.md – Public Interfaces): profilna slika, slika skupine in slika kontakta. Vsak test teče pri 360 in
// 1280 px, scenarij z oznako @w768 tudi pri 768 px. Več uporabnikov je prijavljenih v ločenih kontekstih; vloge in
// arhiviranje pripravi SQL (D-27). Avatarji ob imenu so okras (`alt=""`), zato se prikaz slike preverja po uspešnem
// prenosu slike (zaščitena pot z žetonom), ne po DOM-u.

test.use({ locale: 'sl-SI' });
test.describe.configure({ timeout: 120_000 });

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

async function signedIn(page: Page, name = 'Ana Novak'): Promise<TestUser> {
  const user = uniqueUser(name);
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  return user;
}

async function memberPage(browser: Browser, page: Page, groupId: string, name: string, role: Role) {
  const context = await browser.newContext({
    locale: 'sl-SI',
    viewport: page.viewportSize() ?? undefined,
  });
  const member = await context.newPage();
  const user = await signedIn(member, name);
  setRole(groupId, user.email, role);
  return { context, page: member, user };
}

/** Sporočilo o izidu pod gumbi slike (`role="status"`); besedilo iz prevodov. */
const notice = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const photoRegion = (page: Page) => page.getByRole('region', { name: 'Profilna slika' });

/** Stanje odgovora na branje zaščitene slike z žetonom prijavljenega uporabnika. */
async function photoStatus(page: Page, path: string): Promise<number> {
  const response = await page.request.get(`/api${path}`, {
    headers: { Authorization: `Bearer ${await idToken(page)}` },
  });
  return response.status();
}

/** Naloži sliko kontaktu prek API-ja (brez vmesnika); vrne novo verzijo kontakta. */
async function putContactPhoto(page: Page, groupId: string, contactId: string): Promise<void> {
  const current = await getContact(page, groupId, contactId);
  const response = await page.request.put(`/api/groups/${groupId}/contacts/${contactId}/photo`, {
    headers: { Authorization: `Bearer ${await idToken(page)}` },
    multipart: { file: PNG, version: String(current.version) },
  });
  expect(response.status()).toBe(200);
}

// --- Profilna slika (US1) -----------------------------------------------------------------------------------------

test('FR-018-01 FR-018-02 FR-018-20: profilna slika – JPEG, zamenjava s PNG, odstranitev; avatar v meniju in med člani', async ({
  page,
}) => {
  const user = await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });

  // Brez prijave slika ni dostopna (FR-018-20).
  const anonymous = await page.request.get('/api/me/photo');
  expect(anonymous.status()).toBe(401);

  await page.goto('/account');
  const region = photoRegion(page);
  await expect(region).toBeVisible();
  await expect(region.getByRole('button', { name: 'Odstrani sliko' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Naloži: JPEG; obrezovanje s tipkovnico (puščice in plus), fokus na obrezovalniku.
  await region.getByRole('button', { name: 'Naloži sliko' }).click();
  await expect(uploadDialog(page)).toBeVisible();
  await expect(uploadDialog(page).getByLabel('Izberi datoteko')).toBeFocused();
  await expectNoAxeViolations(page);
  await chooseFile(page, JPEG);
  await expect(uploadDialog(page).getByRole('button', { name: 'Obrezovanje slike' })).toBeFocused();
  await expectNoAxeViolations(page);
  const loaded = photoLoaded(page, '/api/me/photo');
  await cropWithKeyboardAndSave(page);
  await expect(uploadDialog(page)).toHaveCount(0);
  await expect(notice(page, 'Slika je shranjena.')).toBeVisible();
  await loaded;
  await expect(region.getByRole('button', { name: 'Zamenjaj sliko' })).toBeVisible();
  await expect(region.getByRole('button', { name: 'Odstrani sliko' })).toBeVisible();
  expect(await photoStatus(page, '/me/photo')).toBe(200);
  await expectNoAxeViolations(page);

  // Zamenjava s PNG.
  const replaced = photoLoaded(page, '/api/me/photo');
  await uploadPhoto(page, 'Zamenjaj sliko', PNG);
  await replaced;
  await expect(notice(page, 'Slika je shranjena.')).toBeVisible();

  // Avatar v meniju računa (iste seje) in v seznamu članov skupine.
  const inMembers = photoLoaded(page, '/members/');
  await page.goto(`/groups/${groupId}/settings`);
  const table = page.getByRole('table', { name: 'Člani' });
  await expect(table).toContainText(user.email);
  // Slika se prenese šele, ko je avatar viden (leno nalaganje).
  await table.scrollIntoViewIfNeeded();
  await inMembers;
  await expectNoAxeViolations(page);

  // Odstranitev s potrditvijo; slika ni več na voljo.
  await page.goto('/account');
  await removePhoto(page);
  await expect(notice(page, 'Slika je odstranjena.')).toBeVisible();
  await expect(region.getByRole('button', { name: 'Naloži sliko' })).toBeVisible();
  await expect(region.getByRole('button', { name: 'Odstrani sliko' })).toHaveCount(0);
  expect(await photoStatus(page, '/me/photo')).toBe(404);
  await expectNoAxeViolations(page);
});

test('FR-018-01 FR-018-14: neveljavna datoteka – trajna napaka v dialogu, stara slika ostane; PNG s prosojnostjo se naloži', async ({
  page,
}) => {
  await signedIn(page);
  await page.goto('/account');
  await uploadPhoto(page, 'Naloži sliko', PNG);
  await expect(notice(page, 'Slika je shranjena.')).toBeVisible();

  await photoRegion(page).getByRole('button', { name: 'Zamenjaj sliko' }).click();
  await chooseFile(page, NOT_AN_IMAGE);
  await expect(uploadDialog(page).getByRole('alert')).toContainText('Datoteka ni veljavna slika.');
  await expectNoAxeViolations(page);
  await uploadDialog(page).getByRole('button', { name: 'Prekliči' }).click();
  await expect(uploadDialog(page)).toHaveCount(0);
  expect(await photoStatus(page, '/me/photo')).toBe(200);

  await uploadPhoto(page, 'Zamenjaj sliko', PNG_ALPHA);
  await expect(photoRegion(page).getByRole('button', { name: 'Odstrani sliko' })).toBeVisible();
});

// --- Slika skupine (US2) ------------------------------------------------------------------------------------------

test('FR-018-05 FR-018-06 FR-018-08: slika skupine – admin naloži, bralec vidi brez akcij, arhivirana brez akcij, avatar na domači strani', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const viewer = await memberPage(browser, page, groupId, 'Dana Zupan', 'VIEWER');
  const editor = await memberPage(browser, page, groupId, 'Cene Kralj', 'EDITOR');

  // Lastnik naloži sliko skupine.
  await page.goto(`/groups/${groupId}/settings`);
  const section = page.getByRole('group', { name: 'Slika skupine' });
  await expect(section).toBeVisible();
  await expectNoAxeViolations(page);
  const loaded = photoLoaded(page, `/api/groups/${groupId}/photo`);
  await uploadPhoto(page, 'Naloži sliko', JPEG);
  await expect(notice(page, 'Slika skupine je shranjena.')).toBeVisible();
  await loaded;
  await expect(section.getByRole('button', { name: 'Zamenjaj sliko' })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Bralec vidi sliko (200), a razdelek in akcije za urejanje nima; urednik tudi ne.
  expect(await photoStatus(viewer.page, `/groups/${groupId}/photo`)).toBe(200);
  for (const member of [viewer, editor]) {
    await member.page.goto(`/groups/${groupId}/settings`);
    await expect(member.page.getByRole('table', { name: 'Člani' })).toBeVisible();
    await expect(member.page.getByRole('button', { name: 'Zamenjaj sliko' })).toHaveCount(0);
    await expect(member.page.getByRole('button', { name: 'Odstrani sliko' })).toHaveCount(0);
    await expect(member.page.getByRole('button', { name: 'Naloži sliko' })).toHaveCount(0);
  }
  // Avatar skupine se bralcu pokaže na domači strani (zaščiten prenos z žetonom).
  const home = photoLoaded(viewer.page, `/api/groups/${groupId}/photo`);
  await viewer.page.goto('/');
  await expect(viewer.page.getByRole('main')).toContainText('Projekt FERI');
  await home;
  await expectNoAxeViolations(viewer.page);

  await viewer.context.close();
  await editor.context.close();

  // Odstranitev slike skupine.
  await removePhoto(page);
  await expect(notice(page, 'Slika skupine je odstranjena.')).toBeVisible();
  expect(await photoStatus(page, `/groups/${groupId}/photo`)).toBe(404);

  // Arhivirana skupina: slika je vidna, akcij ni.
  await uploadPhoto(page, 'Naloži sliko', PNG);
  archive(groupId);
  await page.goto(`/groups/${groupId}/settings`);
  await expect(page.getByRole('table', { name: 'Člani' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zamenjaj sliko' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Odstrani sliko' })).toHaveCount(0);
  expect(await photoStatus(page, `/groups/${groupId}/photo`)).toBe(200);
  await expectNoAxeViolations(page);
});

// --- Slika kontakta (US3) -----------------------------------------------------------------------------------------

test('FR-018-09 FR-018-10 FR-018-12: slika kontakta – naloži, zamenjaj, odstrani; sled prikaže dogodke; izbris in obnova vrneta sliko', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Stranke' });
  const contactId = await createContactViaApi(page, groupId, {
    firstName: 'Janez',
    lastName: 'Novak',
  });
  const path = `/groups/${groupId}/contacts/${contactId}/photo`;

  await page.goto(`/groups/${groupId}/contacts/${contactId}/edit`);
  const section = page.getByRole('group', { name: 'Slika kontakta' });
  await expect(section).toBeVisible();
  await expectNoAxeViolations(page);

  const added = photoLoaded(page, path);
  await uploadPhoto(page, 'Naloži sliko', JPEG);
  await expect(notice(page, 'Slika kontakta je shranjena.')).toBeVisible();
  await added;
  expect(await photoStatus(page, `/groups/${groupId}/contacts/${contactId}/photo`)).toBe(200);
  await uploadPhoto(page, 'Zamenjaj sliko', PNG);
  await expectNoAxeViolations(page);

  // Shranjevanje polj po spremembi slike ne sproži lažnega konflikta verzij.
  await page.getByRole('textbox', { name: 'Telefon' }).fill('+386 1 234 56 78');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/contacts/${contactId}$`));
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Pogled kontakta in seznam prikažeta sliko.
  const view = photoLoaded(page, path);
  await page.goto(`/groups/${groupId}/contacts/${contactId}`);
  await view;
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Sled: dodana in zamenjana slika; odstranitev doda še en dogodek.
  await page.goto(`/groups/${groupId}/contacts/${contactId}/edit`);
  await removePhoto(page);
  await expect(notice(page, 'Slika kontakta je odstranjena.')).toBeVisible();
  await page.goto(`/groups/${groupId}/audit`);
  const entries = page.getByRole('list', { name: 'Vnosi revizijske sledi' });
  await expect(entries).toContainText('dodal(a) sliko kontakta');
  await expect(entries).toContainText('zamenjal(a) sliko kontakta');
  await expect(entries).toContainText('odstranil(a) sliko kontakta');
  await expect(entries).not.toContainText('Ni sprememb');
  await expectNoAxeViolations(page);

  // Izbris in obnova vrneta sliko (obnova izbrisanega kontakta, 015).
  await page.goto(`/groups/${groupId}/contacts/${contactId}/edit`);
  await uploadPhoto(page, 'Naloži sliko', JPEG);
  await deleteContactViaApi(page, groupId, contactId);
  await page.goto(`/groups/${groupId}/deleted-contacts`);
  await page.getByRole('button', { name: 'Obnovi kontakt Janez Novak' }).click();
  const dialog = page.getByRole('dialog', { name: /Obnovim kontakt Janez Novak/ });
  await dialog.getByRole('button', { name: 'Obnovi kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt je obnovljen');
  expect(await photoStatus(page, `/groups/${groupId}/contacts/${contactId}/photo`)).toBe(200);
  await expectNoAxeViolations(page);
});

test('FR-018-11: združevanje dvojnikov – preživeli prevzame sliko poraženega, brez podvajanja', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Dvojniki' });
  const [keeper, loser] = seedDuplicates(groupId, 2);
  if (!keeper || !loser) throw new Error('kontakta nista ustvarjena');
  await putContactPhoto(page, groupId, loser);
  expect(await photoStatus(page, `/groups/${groupId}/contacts/${keeper}/photo`)).toBe(404);

  await page.goto(`/groups/${groupId}/contacts`);
  await page
    .getByRole('navigation', { name: 'Razdelki skupine' })
    .getByRole('link', { name: 'Dvojniki' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Kategorija' })
    .getByRole('radio', { name: 'E-naslov' })
    .check();
  await page.getByRole('button', { name: 'Poišči dvojnike' }).click();
  await page
    .getByRole('listitem', { name: /^Enak e-naslov:/ })
    .getByRole('button', { name: 'Primerjaj in združi' })
    .click();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Združi kontakte' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Združi 2 kontakta' }).click();
  await expect(toast(page)).toContainText('Združenih kontaktov: 2');

  expect(await photoStatus(page, `/groups/${groupId}/contacts/${keeper}/photo`)).toBe(200);
  expect(await photoStatus(page, `/groups/${groupId}/contacts/${loser}/photo`)).toBe(404);
});

test('FR-018-09 FR-018-14 @w768: obrezovalnik slike kontakta je uporaben pri 768 px', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Stranke' });
  const contactId = await createContactViaApi(page, groupId, {
    firstName: 'Mojca',
    lastName: 'Kralj',
  });
  await page.goto(`/groups/${groupId}/contacts/${contactId}/edit`);
  await page.getByRole('button', { name: 'Naloži sliko' }).click();
  await chooseFile(page, PNG);
  const crop = uploadDialog(page).getByRole('button', { name: 'Obrezovanje slike' });
  await expect(crop).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  const dialogBox = await uploadDialog(page).boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  await expect(uploadDialog(page).getByRole('button', { name: 'Shrani sliko' })).toBeInViewport();
});
