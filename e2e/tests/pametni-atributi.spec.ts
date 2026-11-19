import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import {
  attributesOf,
  createContactWithAttributes,
  createSearchContact,
  tagsOf,
} from './support/contacts';
import { createGroup, sql } from './support/groups';
import { exportSelection } from './support/importExport';
import { readXlsx } from './support/xlsx';

// 013 pametni atributi: država in podjetje, predlogi ključev, vrednosti in značk, kanonični zapis ključa, prenos starega
// atributa v polje. Vsak test teče pri 360 in 1280 px; podatke druge skupine ali drugih uporabnikov pripravi SQL.

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

const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const contactId = (page: Page) => /\/contacts\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
const country = (id: string) =>
  sql(`select coalesce(country, '') from contact where id = '${id}'::uuid`);
const company = (id: string) =>
  sql(`select coalesce(company, '') from contact where id = '${id}'::uuid`);

async function chooseCountry(page: Page, query: string, option: string) {
  const field = page.getByRole('combobox', { name: 'Država', exact: true });
  await field.click();
  await field.fill(query);
  await page.getByRole('option', { name: option }).click();
  await expect(field).toHaveValue(option);
}

test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

test('FR-013-01 FR-013-03 FR-013-04 FR-013-12 FR-013-13: kontakt s podjetjem in državo – obrazec, pogled, iskanje po imenu in kodi, izvoz', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchContact(id, { first: 'Bojan', last: 'Drugi' });

  await page.goto(`/groups/${id}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Janez');
  await page.getByRole('textbox', { name: 'Priimek' }).fill('Novak');
  await page.getByRole('combobox', { name: 'Podjetje' }).fill('Acme d.o.o.');
  await chooseCountry(page, 'avs', 'Avstrija');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  await expect(toast(page)).toContainText('Kontakt Janez Novak je shranjen.');
  const created = contactId(page);
  expect(country(created)).toBe('AT');
  expect(company(created)).toBe('Acme d.o.o.');
  await expect(page.getByRole('definition').filter({ hasText: 'Avstrija' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Acme d.o.o.' })).toBeVisible();
  await expectNoAxeViolations(page);

  const table = page.getByRole('table', { name: 'Kontakti skupine Projekt FERI' });
  const area = page.getByRole('search', { name: 'Iskanje in filtri' });
  await page.goto(`/groups/${id}/contacts`);
  for (const query of ['acme', 'avstrija', 'austria', 'at']) {
    await area.getByRole('searchbox', { name: 'Iskanje po kontaktih' }).fill(query);
    await expect(table).toContainText('Janez Novak');
    await expect(table).not.toContainText('Bojan Drugi');
  }

  await area.getByRole('searchbox', { name: 'Iskanje po kontaktih' }).fill('');
  await expect(table).toContainText('Bojan Drugi');
  await page.getByRole('checkbox', { name: /^Izberi Janez Novak/ }).check();
  const downloading = page.waitForEvent('download');
  await exportSelection(page);
  const download = await downloading;
  const file = await readXlsx((await download.path()) ?? '');
  expect(file.rows[0]).toEqual([
    'Ime',
    'Priimek',
    'Naslov',
    'E-naslov',
    'Telefon',
    'Država',
    'Podjetje',
    'Značke',
  ]);
  expect(file.rows[1]).toEqual(['Janez', 'Novak', '', '', '', 'Avstrija', 'Acme d.o.o.', '']);
});

test('FR-013-09 FR-013-10 FR-013-11 FR-013-14 FR-013-18 SC-001: predlogi ključa, vrednosti in značk; kanonični zapis ključa in značke', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createContactWithAttributes(id, 'Ana Prva', [['Kompetenca', 'web dev']]);
  createContactWithAttributes(id, 'Bor Drugi', [['Kompetenca', 'data']]);
  createContactWithAttributes(id, 'Cene Tretji', [['Vloga', 'vodja']]);
  sql(
    `insert into contact_tag (contact_id, position, tag, tag_norm)
     select id, 0, 'vip', 'vip' from contact where group_id = '${id}'::uuid`,
  );

  await page.goto(`/groups/${id}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Dana');
  await page.getByRole('textbox', { name: 'Priimek' }).fill('Novak');
  await page.getByRole('button', { name: 'Dodaj atribut' }).click();

  const key = page.getByRole('combobox', { name: 'Ključ', exact: true });
  await key.focus();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Kompetenca');
  await key.press('ArrowDown');
  await key.press('Enter');
  await expect(key).toHaveValue('Kompetenca');
  const value = page.getByRole('combobox', { name: 'Vrednost' });
  await value.focus();
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('data');
  await value.fill('web');
  await page.getByRole('option', { name: /^web dev/ }).click();
  await expect(value).toHaveValue('web dev');

  await page.getByRole('button', { name: 'Dodaj atribut' }).click();
  const second = page.getByRole('combobox', { name: 'Ključ', exact: true }).last();
  await second.fill('VLOGA');
  await page.getByRole('combobox', { name: 'Vrednost' }).last().click();
  await expect(second).toHaveValue('Vloga');
  await page.getByRole('combobox', { name: 'Vrednost' }).last().fill('član');

  const tags = page.getByRole('combobox', { name: 'Dodaj značko' });
  await tags.focus();
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('vip');
  await tags.fill('VIP');
  await page.keyboard.press('Enter');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  const created = contactId(page);
  expect(attributesOf(created)).toEqual([
    ['Kompetenca', 'web dev'],
    ['Vloga', 'član'],
  ]);
  expect(tagsOf(created)).toEqual(['vip']);
});

test('FR-013-08 FR-013-20: star atribut Država se prenese v polje (ena država), dvoumna vrednost zahteva izbiro; nov rezerviran ključ je zavrnjen', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const found = createContactWithAttributes(id, 'Ana Prva', [['Država', 'Slovenija']]);
  const ambiguous = createContactWithAttributes(id, 'Bor Drugi', [['Država', 'Korea']]);

  await page.goto(`/groups/${id}/contacts/${found}/edit`);
  await page.getByRole('textbox', { name: 'Priimek' }).fill('Prva');
  await expect(page.getByRole('button', { name: 'Premakni v polje Država' })).toBeVisible();
  await page.getByRole('button', { name: 'Premakni v polje Država' }).click();
  await expect(page.getByRole('combobox', { name: 'Država', exact: true })).toHaveValue(
    'Slovenija',
  );
  expect(attributesOf(found)).toEqual([['Država', 'Slovenija']]);
  expect(country(found)).toBe('');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Ana Prva je shranjen.');
  expect(attributesOf(found)).toEqual([]);
  expect(country(found)).toBe('SI');

  await page.goto(`/groups/${id}/contacts/${ambiguous}/edit`);
  await page.getByRole('button', { name: 'Premakni v polje Država' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('dvoumna');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Prekliči' }).click();
  await expect(page.getByRole('combobox', { name: 'Država', exact: true })).toHaveValue('');
  expect(attributesOf(ambiguous)).toEqual([['Država', 'Korea']]);
  expect(country(ambiguous)).toBe('');

  await page.goto(`/groups/${id}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Nov');
  await page.getByRole('button', { name: 'Dodaj atribut' }).click();
  await page.getByRole('combobox', { name: 'Ključ', exact: true }).fill('Company');
  await page.getByRole('combobox', { name: 'Vrednost' }).fill('Acme');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Ključ', exact: true }),
  ).toHaveAccessibleDescription(/rezervirano/);
});
