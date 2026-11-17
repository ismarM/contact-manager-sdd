import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signIn, uniqueUser } from './support/auth';
import { createGroup } from './support/groups';
import { NAMES, xlsxBuffer } from './support/importExport';

// 020 prenova vmesnika (Kartoteka v2): obrazec kontakta, uvoz, zgodovina in dialogi po platnu; vsak test teče pri 360 in
// 1280 px, axe brez kršitev.
test.use({ locale: 'sl-SI' });

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function groupWithContact(page: Page) {
  await page.goto('/');
  await signIn(page, uniqueUser('Ana Novak'));
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${groupId}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Maja');
  await page.getByRole('textbox', { name: 'Priimek' }).fill('Kovač');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/contacts/[0-9a-f-]{36}$`));
  return { groupId, contactUrl: page.url() };
}

test('FR-020-22: obrazec kontakta – razdelki v karticah, nazaj na kontakt, Shrani in Prekliči, brez kršitev axe', async ({
  page,
}) => {
  const { contactUrl } = await groupWithContact(page);
  await page.goto(`${contactUrl}/edit`);

  await expect(page.getByRole('heading', { level: 2, name: 'Uredi kontakt' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nazaj na kontakt' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Osnovni podatki' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Dodatni atributi' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Značke' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shrani kontakt' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Prekliči' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'Nazaj na kontakt' }).click();
  await expect(page).toHaveURL(contactUrl);
});

test('FR-020-22: uvoz iz Excela – kartica datoteke, preslikava stolpcev v preglednici, predogled, Prekliči', async ({
  page,
}) => {
  const { groupId } = await groupWithContact(page);
  const file = await xlsxBuffer([
    ['Ime', 'Priimek', 'E-naslov', 'Spletna stran'],
    ['Tina', 'Hribar', 'tina@primer.si', 'tina.example'],
  ]);
  await page.goto(`/groups/${groupId}/contacts`);
  await page.getByRole('button', { name: NAMES.importMenu }).click();
  await page.getByRole('menuitem', { name: NAMES.fromExcel }).click();
  await page
    .getByLabel(NAMES.xlsxFile)
    .setInputFiles({ name: 'partnerji.xlsx', mimeType: 'application/octet-stream', buffer: file });
  await page.getByRole('button', { name: NAMES.read }).click();

  await expect(page.getByRole('heading', { level: 3, name: 'Preslikava stolpcev' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Stolpec' })).toBeVisible();
  await expect(page.getByRole('button', { name: NAMES.confirm(1) })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Prekliči' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('link', { name: 'Prekliči' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/contacts$`));
});

test('FR-020-22: zgodovina kontakta in izbrisani kontakti – seznam kartic, brez kršitev axe', async ({
  page,
}) => {
  const { groupId, contactUrl } = await groupWithContact(page);
  await page.goto(`${contactUrl}/history`);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Zgodovina kontakta Maja Kovač' }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Dogodki zgodovine kontakta' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto(`/groups/${groupId}/deleted-contacts`);
  await expect(page.getByRole('heading', { level: 2, name: 'Izbrisani kontakti' })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-020-23: dialog izbrisa kontakta – naslov je vprašanje, fokus na Prekliči, odprt brez kršitev axe, Esc zapre', async ({
  page,
}) => {
  const { contactUrl } = await groupWithContact(page);
  await page.goto(contactUrl);
  await page.getByRole('button', { name: 'Izbriši kontakt' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toContainText('?');
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  if ((page.viewportSize()?.width ?? 0) < 640) {
    // Telefon: spodnja ploskev čez celo širino, pritrjena na spodnji rob.
    const box = await dialog.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(box?.x).toBe(0);
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(height);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('FR-020-22: dialog slike – izbira datoteke na črtkani ploskvi, Esc zapre', async ({
  page,
}) => {
  const { contactUrl } = await groupWithContact(page);
  await page.goto(`${contactUrl}/edit`);
  await page.getByRole('button', { name: 'Naloži sliko' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
