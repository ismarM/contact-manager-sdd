import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import {
  archive,
  createGroup,
  groupExists,
  makePermanentlyArchived,
  memberCount,
  setRole,
} from './support/groups';

// 003 arhiviranje in izbris skupine (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px; stranski pas je
// viden od 1024 px. Druge vloge, trajno arhivirano stanje (012) in arhiviranje drugih skupin pripravi SQL (D-27).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function signedIn(page: Page, name = 'Ana Novak'): Promise<TestUser> {
  const user = uniqueUser(name);
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  return user;
}

async function otherUser(browser: Browser, page: Page, name: string) {
  const context = await browser.newContext({
    locale: 'sl-SI',
    viewport: page.viewportSize() ?? undefined,
  });
  const other = await context.newPage();
  const user = await signedIn(other, name);
  return { context, page: other, user };
}

const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const banner = (page: Page) => page.getByRole('region', { name: 'Stanje skupine' });
const management = (page: Page) => page.getByRole('region', { name: 'Upravljanje skupine' });

test.use({ locale: 'sl-SI' });

test('FR-003-01 FR-003-02 FR-003-04 FR-003-05 FR-003-07 SC-002 SC-003: lastnik arhivira skupino, pasica in seznam arhiviranih', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI', description: 'Kontakti projekta' });
  await page.goto(`/groups/${id}/settings`);
  const started = Date.now();

  await management(page).getByRole('button', { name: 'Arhiviraj skupino' }).click();
  const dialog = page.getByRole('dialog', { name: 'Arhiviram skupino Projekt FERI?' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(management(page).getByRole('button', { name: 'Arhiviraj skupino' })).toBeFocused();

  await management(page).getByRole('button', { name: 'Arhiviraj skupino' }).click();
  await dialog.getByRole('button', { name: 'Arhiviraj skupino' }).click();

  await expect(toast(page)).toContainText('Skupina je arhivirana.');
  expect(Date.now() - started).toBeLessThan(30_000);
  await expect(banner(page)).toContainText(
    'Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.',
  );
  await expect(page.getByRole('region', { name: 'Projekt FERI' })).toContainText('Arhivirano');
  await expect(page.getByRole('form', { name: 'Podatki skupine' })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.goto('/');
  await expect(page.getByRole('main').getByRole('link', { name: 'Projekt FERI' })).toHaveCount(0);
  await page.getByRole('main').getByRole('link', { name: 'Arhivirane skupine' }).click();
  await expect(page).toHaveURL(/\/groups\/archived$/);
  await expect(page).toHaveTitle('Arhivirane skupine – Kontakti');
  await expect(page.getByRole('heading', { level: 1, name: 'Arhivirane skupine' })).toBeVisible();
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: 'Projekt FERI' }) });
  await expect(row).toContainText('Vloga: Lastnik');
  await expect(row).toContainText('Arhivirano');
  await expectNoAxeViolations(page);
  await row.getByRole('link', { name: 'Projekt FERI' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts$`));
});

test('FR-003-05 FR-003-06: urednik vidi pasico brez odarhiviranja, lastnik odarhivira in skupina se vrne', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Konferenca 2025' });
  const eva = await otherUser(browser, page, 'Eva Urednik');
  setRole(id, eva.user.email, 'EDITOR');
  archive(id);

  await eva.page.goto(`/groups/${id}/settings`);
  await expect(banner(eva.page)).toContainText('Skupina je arhivirana');
  await expect(eva.page.getByRole('button', { name: 'Odarhiviraj skupino' })).toHaveCount(0);
  await expect(eva.page.getByRole('button', { name: 'Arhiviraj skupino' })).toHaveCount(0);
  await expectNoAxeViolations(eva.page);
  await eva.page.goto('/');
  await expect(
    eva.page.getByRole('main').getByRole('link', { name: 'Konferenca 2025' }),
  ).toHaveCount(0);

  await page.goto(`/groups/${id}/settings`);
  await banner(page).getByRole('button', { name: 'Odarhiviraj skupino' }).click();
  await expect(toast(page)).toContainText('Skupina je odarhivirana.');
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'Podatki skupine' })).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('main').getByRole('heading', { level: 2, name: 'Lastnik (1)' }),
  ).toBeVisible();
  await eva.context.close();
});

test('FR-003-08 FR-003-09 FR-003-07: trajno arhivirana skupina – pasica, opomba na seznamu, brez odarhiviranja, izbris zadnjega člana', async ({
  page,
}) => {
  const user = await signedIn(page, 'Eva Bralka');
  await page.goto('/');
  await page.getByRole('main').getByRole('button', { name: 'Nova skupina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova skupina' });
  await dialog.getByRole('textbox', { name: 'Naslov' }).fill('Brez lastnika');
  await dialog.getByRole('button', { name: 'Ustvari skupino' }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}\/contacts$/);
  const id = /\/groups\/([0-9a-f-]{36})\//.exec(page.url())?.[1] ?? '';
  // Eva je edina članica: postane bralka, skupina pa trajno arhivirana (stanje, ki ga povzroči 012).
  setRole(id, user.email, 'VIEWER');
  makePermanentlyArchived(id);

  await page.reload();
  await expect(banner(page)).toContainText(
    'Skupina je trajno arhivirana, ker lastnik nima več računa.',
  );
  await expect(page.getByRole('button', { name: 'Odarhiviraj skupino' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.goto('/groups/archived');
  await expect(
    page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Brez lastnika' }) }),
  ).toContainText('lastnik: izbrisan uporabnik');
  await expectNoAxeViolations(page);

  await page.goto(`/groups/${id}/settings`);
  await management(page).getByRole('button', { name: 'Izbriši skupino' }).click();
  const confirm = page.getByRole('dialog', { name: 'Izbrišem skupino Brez lastnika?' });
  await confirm
    .getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' })
    .fill('Brez lastnika');
  await confirm.getByRole('button', { name: 'Izbriši skupino' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(toast(page)).toContainText('Skupina je izbrisana.');
  expect(groupExists(id)).toBe(false);
});

test('FR-003-09 FR-003-10 FR-003-11: izbris z vpisom naslova; povezava nato vodi na »Te strani ni«', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/settings`);

  await management(page).getByRole('button', { name: 'Izbriši skupino' }).click();
  const dialog = page.getByRole('dialog', { name: 'Izbrišem skupino Projekt FERI?' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  const field = dialog.getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' });
  await field.fill('Napačen naslov');
  await dialog.getByRole('button', { name: 'Izbriši skupino' }).click();
  await expect(dialog).toContainText('Vpisano besedilo se ne ujema z naslovom skupine.');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(groupExists(id)).toBe(true);
  await expectNoAxeViolations(page);

  await field.fill('Projekt FERI');
  await dialog.getByRole('button', { name: 'Izbriši skupino' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(toast(page)).toContainText('Skupina je izbrisana.');
  expect(groupExists(id)).toBe(false);
  expect(memberCount(id)).toBe(0);
  await page.goto(`/groups/${id}/settings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Te strani ni' })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-003-09 FR-003-10: lastnik z drugim članom nima gumba Izbriši skupino, ampak razlago', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Skupna' });
  const bojan = await otherUser(browser, page, 'Bojan Kos');
  setRole(id, bojan.user.email, 'VIEWER');

  await page.goto(`/groups/${id}/settings`);
  await expect(management(page)).toBeVisible();
  await expect(management(page).getByRole('button', { name: 'Izbriši skupino' })).toHaveCount(0);
  await expect(management(page)).toContainText('Skupino lahko izbrišeš, ko si njen edini član.');
  await expectNoAxeViolations(page);
  await bojan.context.close();
});

test('FR-003-01 FR-003-06 FR-003-10 SC-006: angleški vmesnik – pasica, dialoga in seznam brez kršitev axe', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Project' });
  await page.goto(`/groups/${id}/settings`);
  await page.getByRole('button', { name: 'Meni računa' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await page.keyboard.press('Escape');

  await page
    .getByRole('region', { name: 'Group management' })
    .getByRole('button', { name: 'Archive group' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Archive group Project?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Archive group' }).click();

  await expect(page.getByRole('region', { name: 'Group status' })).toContainText(
    'This group is archived – you can browse, search and export.',
  );
  await expectNoAxeViolations(page);
  await page.goto('/groups/archived');
  await expect(page).toHaveTitle('Archived groups – Contacts');
  await expect(
    page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Project' }) }),
  ).toContainText('Archived');
  await expectNoAxeViolations(page);
  expect(groupExists(id)).toBe(true);
});
