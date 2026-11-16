import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import { createGroup, setRole } from './support/groups';
import {
  auditActions,
  createContactWithTypedAttribute,
  keyTypeOf,
  valuesOfKey,
} from './support/typedAttributes';

// 016 tipizirani atributi (US1): tip ključa v skupini, drugi kontakt prevzame tip, razdelek Atributi skupine, sprememba
// tipa z in brez konflikta, bralec brez gumba. Vsak test teče pri 360 in 1280 px; stare podatke pripravi SQL.

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

async function openAttributes(page: Page, groupId: string) {
  await page.goto(`/groups/${groupId}/attributes`);
  await expect(page.getByRole('heading', { level: 2, name: 'Atributi skupine' })).toBeVisible();
}

async function newContact(page: Page, groupId: string, first: string) {
  await page.goto(`/groups/${groupId}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill(first);
  await page.getByRole('button', { name: 'Dodaj atribut' }).click();
}

test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

test('FR-016-01 FR-016-04: nov ključ s tipom Telefon, drugi kontakt prevzame tip in vrednosti so normalizirane', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });

  await newContact(page, id, 'Ana');
  await page.getByRole('combobox', { name: 'Ključ' }).fill('Mobilni');
  await page
    .getByRole('combobox', { name: 'Tip novega ključa' })
    .selectOption({ label: 'Telefon' });
  await page.getByLabel('Vrednost', { exact: true }).fill('041 123 456');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  await expect(toast(page)).toContainText('Kontakt Ana je shranjen.');
  expect(keyTypeOf(id, 'Mobilni')).toBe('PHONE');
  expect(valuesOfKey(id, 'Mobilni')).toEqual(['+38641123456']);
  await expect(page.getByRole('link', { name: '+38641123456' })).toHaveAttribute(
    'href',
    'tel:+38641123456',
  );
  await expectNoAxeViolations(page);

  await newContact(page, id, 'Bojan');
  await page.getByRole('combobox', { name: 'Ključ' }).fill('MOBILNI');
  await page.getByLabel('Vrednost', { exact: true }).click();
  await expect(page.getByText('Tip ključa v tej skupini je Telefon.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Tip novega ključa' })).toHaveCount(0);
  await page.getByLabel('Vrednost', { exact: true }).fill('031 765 432');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();

  await expect(toast(page)).toContainText('Kontakt Bojan je shranjen.');
  expect(valuesOfKey(id, 'Mobilni')).toEqual(['+38631765432', '+38641123456']);
  expect(keyTypeOf(id, 'Mobilni')).toBe('PHONE');
});

test('FR-016-01 FR-016-05 FR-016-27: Atributi skupine – sprememba tipa najprej s konfliktom, nato uspešna', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createContactWithTypedAttribute(id, 'Ana Prva', 'Pošta', 'ana@primer.si');
  createContactWithTypedAttribute(id, 'Bor Drugi', 'Pošta', 'ni-e-naslov');
  createContactWithTypedAttribute(id, 'Cene Tretji', 'Mobilni', '+38641123456', 'PHONE');

  await openAttributes(page, id);
  const table = page.getByRole('table');
  await expect(table.getByRole('row', { name: /Pošta\s+Drugo\s+2/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Mobilni\s+Telefon\s+1/ })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: 'Spremeni tip ključa Pošta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sprememba tipa ključa' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await dialog.getByRole('combobox', { name: 'Novi tip' }).selectOption({ label: 'E-naslov' });
  await dialog.getByRole('button', { name: 'Spremeni tip', exact: true }).click();

  const conflict = dialog.getByRole('alert');
  await expect(conflict).toContainText('Pri 1 kontaktih vrednost ne ustreza tipu E-naslov');
  await expect(conflict.getByRole('link', { name: 'Odpri kontakt Bor Drugi' })).toBeVisible();
  await expectNoAxeViolations(page);
  expect(keyTypeOf(id, 'Pošta')).toBe('OTHER');
  expect(auditActions(id)).toEqual([]);

  // Povezava vodi na kontakt; vrednost se popravi in sprememba tipa uspe.
  await conflict.getByRole('link', { name: 'Odpri kontakt Bor Drugi' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  await page.goto(`${page.url()}/edit`);
  await page.getByLabel('Vrednost', { exact: true }).fill('bor@primer.si');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Bor Drugi je shranjen.');

  await openAttributes(page, id);
  await page.getByRole('button', { name: 'Spremeni tip ključa Pošta' }).click();
  const retry = page.getByRole('dialog', { name: 'Sprememba tipa ključa' });
  await retry.getByRole('combobox', { name: 'Novi tip' }).selectOption({ label: 'E-naslov' });
  await retry.getByRole('button', { name: 'Spremeni tip', exact: true }).click();

  await expect(toast(page)).toContainText('Tip ključa »Pošta« je spremenjen.');
  await expect(retry).toHaveCount(0);
  await expect(table.getByRole('row', { name: /Pošta\s+E-naslov\s+2/ })).toBeVisible();
  expect(keyTypeOf(id, 'Pošta')).toBe('EMAIL');
  expect(valuesOfKey(id, 'Pošta')).toEqual(['ana@primer.si', 'bor@primer.si']);
  expect(auditActions(id)).toContain('ATTRIBUTE_TYPE');
  await expectNoAxeViolations(page);
});

test('FR-016-27: bralec vidi seznam ključev brez gumba Spremeni tip', async ({ page }) => {
  const user = await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createContactWithTypedAttribute(id, 'Ana Prva', 'Mobilni', '+38641123456', 'PHONE');
  setRole(id, user.email, 'VIEWER');

  await openAttributes(page, id);

  await expect(
    page.getByRole('table').getByRole('row', { name: /Mobilni\s+Telefon\s+1/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Spremeni tip/ })).toHaveCount(0);
  await expectNoAxeViolations(page);
});
