import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import { createSearchContact } from './support/contacts';
import { createGroup } from './support/groups';
import { basic, lastAction, NAMES, namesIn, xlsxBuffer } from './support/importExport';

// 014 uvoz in izvoz (plan.md – Public Interfaces): Excel in vCard v krožni poti, koda QR iz slike, gesla za aplikacijo
// in CardDAV. Podatke pripravi SQL (D-27); vsak test teče pri 360 in 1280 px.
test.describe.configure({ timeout: 120_000 });
test.use({ locale: 'sl-SI' });

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function signedIn(page: Page): Promise<TestUser> {
  const user = uniqueUser('Ana Novak');
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  return user;
}

async function openImport(page: Page, groupId: string, source: 'xlsx' | 'vcf') {
  await page.goto(`/groups/${groupId}/contacts`);
  await page.getByRole('button', { name: NAMES.importMenu }).click();
  await page
    .getByRole('menuitem', { name: source === 'xlsx' ? NAMES.fromExcel : NAMES.fromVcf })
    .click();
}

test('FR-014-02 FR-014-05 FR-014-06 FR-014-09: uvoz Excela z zaščitenimi vrednostmi, en vnos sledi; ponoven uvoz preskoči dvojnike', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Uvoz Excel' });
  const file = await xlsxBuffer([
    ['Ime', 'Priimek', 'E-naslov', 'Značke', 'Formula'],
    ['Ana', 'Kos', 'ana@primer.si', 'alumni, vip', '\'=HYPERLINK("x")'],
    ['Bor', 'Zupan', 'bor@primer.si', '', "'+386"],
  ]);

  await openImport(page, groupId, 'xlsx');
  await page
    .getByLabel(NAMES.xlsxFile)
    .setInputFiles({ name: 'kontakti.xlsx', mimeType: 'application/octet-stream', buffer: file });
  await page.getByRole('button', { name: NAMES.read }).click();
  const confirm = page.getByRole('button', { name: NAMES.confirm(2) });
  await expect(confirm).toBeEnabled();
  await expectNoAxeViolations(page);
  await confirm.click();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/contacts$`));
  expect(namesIn(groupId)).toEqual(['Ana Kos', 'Bor Zupan']);
  expect(lastAction(groupId)).toEqual({ action: 'IMPORT', count: 2 });

  await openImport(page, groupId, 'xlsx');
  await page
    .getByLabel(NAMES.xlsxFile)
    .setInputFiles({ name: 'kontakti.xlsx', mimeType: 'application/octet-stream', buffer: file });
  await page.getByRole('button', { name: NAMES.read }).click();
  await expect(page.getByRole('radio', { name: 'Preskoči' }).first()).toBeChecked();
  await expect(page.getByRole('button', { name: 'Uvozi 0 kontaktov' })).toBeDisabled();
});

test('FR-014-10 FR-014-12 FR-014-13: izbor izvožen v vCard se uvozi v drugo skupino enak', async ({
  page,
}) => {
  await signedIn(page);
  const source = await createGroup(page, { title: 'Vir vizitk' });
  createSearchContact(source, {
    first: 'Čeh',
    last: 'Šuštar',
    email: 'ceh@primer.si',
    phone: '+38641123456',
    address: 'Ulica 1\nKranj',
    attributes: [['Vloga', '=mentor;x']],
    tags: ['alumni'],
  });
  const target = await createGroup(page, { title: 'Cilj vizitk' });

  await page.goto(`/groups/${source}/contacts`);
  await page.getByRole('checkbox', { name: 'Izberi Čeh Šuštar' }).check();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('toolbar', { name: 'Dejanja izbora' })
    .getByRole('button', { name: NAMES.vcfSelection })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^Vir-vizitk-kontakti-\d{4}-\d{2}-\d{2}\.vcf$/);
  const vcf = await readFile(await download.path());

  await openImport(page, target, 'vcf');
  await page
    .getByLabel(NAMES.vcfFile)
    .setInputFiles({ name: 'kontakti.vcf', mimeType: 'text/vcard', buffer: vcf });
  await page.getByRole('button', { name: NAMES.read }).click();
  await page.getByRole('button', { name: NAMES.confirm(1) }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${target}/contacts$`));
  expect(namesIn(target)).toEqual(['Čeh Šuštar']);
});

test('FR-014-14 FR-014-15 FR-014-17 FR-014-18: koda QR kontakta se prebere iz slike in odpre predizpolnjen obrazec', async ({
  page,
}) => {
  await signedIn(page);
  const source = await createGroup(page, { title: 'QR vir' });
  const contact = createSearchContact(source, {
    first: 'Mojca',
    last: 'Kralj',
    email: 'mojca@primer.si',
  });
  const target = await createGroup(page, { title: 'QR cilj' });

  await page.goto(`/groups/${source}/contacts/${contact}`);
  await page.getByRole('button', { name: NAMES.qrShare }).click();
  const dialog = page.getByRole('dialog', { name: 'Koda QR – Mojca Kralj' });
  await expect(dialog.getByRole('img', { name: 'Koda QR s kontaktom Mojca Kralj' })).toBeVisible();
  await expectNoAxeViolations(page);
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: NAMES.qrDownload }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Mojca-Kralj-qr.png');
  const png = await readFile(await download.path());

  await page.goto(`/groups/${target}/contacts`);
  await page.getByRole('button', { name: NAMES.qrScan }).click();
  await page
    .getByLabel(NAMES.pickImage)
    .setInputFiles({ name: 'koda.png', mimeType: 'image/png', buffer: png });

  await expect(page.getByRole('heading', { name: 'Nov kontakt' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Ime', { exact: true })).toHaveValue('Mojca');
  await expect(page.getByLabel('E-naslov')).toHaveValue('mojca@primer.si');
  await page.getByRole('button', { name: NAMES.save }).click();
  await expect.poll(() => namesIn(target)).toEqual(['Mojca Kralj']);
});

test('FR-014-21 FR-014-22 FR-014-25: geslo za aplikacijo odpre CardDAV; po preklicu 401', async ({
  page,
  request,
}) => {
  const user = await signedIn(page);
  await createGroup(page, { title: 'Imenik CardDAV' });

  await page.goto('/account');
  await page.getByRole('button', { name: NAMES.newPassword }).click();
  await page.getByLabel(NAMES.deviceName).fill('Telefon');
  await page.getByRole('button', { name: NAMES.createPassword }).click();
  const dialog = page.getByRole('dialog', { name: 'Geslo za Telefon' });
  // 020: vrednost in gumb za kopiranje sta v istem `dd`; gumb nima besedila, zato je besedilo `dd` samo geslo.
  const password =
    (
      await dialog
        .getByRole('definition')
        .filter({ has: page.getByRole('button', { name: 'Kopiraj Geslo' }) })
        .textContent()
    )?.trim() ?? '';
  expect(password).toMatch(/^([a-z0-9]{4}-){6}[a-z0-9]{4}$/);
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: NAMES.close, exact: true }).click();

  const propfind = () =>
    request.fetch('/dav/addressbooks/', {
      method: 'PROPFIND',
      headers: { Authorization: basic(user.email, password), Depth: '1' },
    });
  const allowed = await propfind();
  expect(allowed.status()).toBe(207);
  expect(await allowed.text()).toContain('Imenik CardDAV');

  await page.getByRole('button', { name: NAMES.revoke('Telefon') }).click();
  await page.getByRole('dialog').getByRole('button', { name: NAMES.revokeConfirm }).click();
  await expect(page.getByRole('button', { name: NAMES.revoke('Telefon') })).toHaveCount(0);

  expect((await propfind()).status()).toBe(401);
});
