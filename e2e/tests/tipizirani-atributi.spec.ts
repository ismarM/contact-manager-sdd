import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { idToken } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import { seedContact } from './support/duplicates';
import { createGroup, setRole } from './support/groups';
import { createSearchContact } from './support/contacts';
import {
  addressPartsOf,
  addressTextOf,
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
  await expect(page.getByRole('link', { name: '+386 41 123 456' })).toHaveAttribute(
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

// US2: normalizacija na strežniku, iskanje po števkah, dvojniki po normaliziranem telefonu.
test('FR-016-02 FR-016-08 FR-016-10 FR-016-11: telefon v različnih zapisih – kanonična oblika, iskanje po števkah, dvojnik', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });

  await page.goto(`/groups/${id}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Ana');
  await page.getByRole('textbox', { name: 'Telefon' }).fill('041 123-456');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Ana je shranjen.');
  await expect(page.getByRole('link', { name: '+386 41 123 456' })).toBeVisible();

  // Neveljavna vrednost: napaka ob polju z imenom, nič se ne shrani.
  await page.goto(`/groups/${id}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Bojan');
  await page.getByRole('textbox', { name: 'Telefon' }).fill('41 1');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(page.getByRole('textbox', { name: 'Telefon' })).toHaveAccessibleDescription(
    /veljaven telefon/i,
  );
  await expectNoAxeViolations(page);

  // Star kontakt z nenormalizirano vrednostjo (SQL): isti telefon v drugi obliki.
  seedContact(id, { first: 'Cene', last: 'Star', phone: '00386 41 123 456' });

  await page.goto(`/groups/${id}/contacts`);
  const box = page.getByRole('search', { name: 'Iskanje in filtri' }).getByRole('searchbox', {
    name: 'Iskanje po kontaktih',
  });
  await box.fill('041 123');
  const rows = page
    .getByRole('table', { name: 'Kontakti skupine Projekt FERI' })
    .getByRole('rowheader');
  await expect(rows).toHaveText(['Ana', 'Cene Star'].map((n) => new RegExp(n)));
  await expectNoAxeViolations(page);

  await page.goto(`/groups/${id}/contacts`);
  await page
    .getByRole('navigation', { name: 'Razdelki skupine' })
    .getByRole('link', { name: 'Dvojniki' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Kategorija' })
    .getByRole('radio', { name: 'Telefon' })
    .check();
  await page.getByRole('button', { name: 'Poišči dvojnike' }).click();
  await expect(page.getByRole('listitem', { name: 'Enak telefon: +38641123456' })).toBeVisible();
  await expectNoAxeViolations(page);
});

// --- US3: strukturiran naslov in samodokončanje (zaledje kliče osm-stub iz compose.verify.yaml) ---------------------

const contactIdFromUrl = (page: Page) => new URL(page.url()).pathname.split('/').at(-1) ?? '';

test('FR-016-12 FR-016-13: naslov po delih s samodokončanjem prek našega strežnika in s tipkovnico', async ({
  page,
}) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Ana');

  const address = page.getByRole('group', { name: 'Naslov', exact: true });
  const street = address.getByRole('combobox', { name: 'Ulica in hišna številka' });
  await street.click();
  await street.pressSequentially('Slovenska 1');
  const list = page.getByRole('listbox', { name: 'Predlogi naslova' });
  await expect(list.getByRole('option')).toHaveText([
    'Slovenska cesta 1, 1000 Ljubljana, Slovenija',
    'Slovenska cesta 10, 1000 Ljubljana, Slovenija',
  ]);
  await expectNoAxeViolations(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(street).toHaveValue('Slovenska cesta 1');
  await expect(address.getByRole('textbox', { name: 'Poštna številka' })).toHaveValue('1000');
  await expect(address.getByRole('combobox', { name: 'Kraj', exact: true })).toHaveValue(
    'Ljubljana',
  );
  await address.getByRole('textbox', { name: 'Dodatna vrstica' }).fill('3. nadstropje');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Ana je shranjen.');

  expect(addressPartsOf(contactIdFromUrl(page))).toEqual({
    street: 'Slovenska cesta 1',
    extra: '3. nadstropje',
    postalCode: '1000',
    city: 'Ljubljana',
    country: 'SI',
  });
  // Brskalnik ne kliče tuje storitve (FR-016-23): vse zahteve gredo na izvor aplikacije.
  expect([...origins]).toEqual([new URL(page.url()).origin]);
});

test('FR-016-14: nerazčlenjen naslov iz časa pred 016 – Razčleni naslov, popravek in shranjevanje', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const contact = createSearchContact(id, {
    first: 'Bojan',
    last: 'Star',
    address: 'Glavni trg 1\n2000 Maribor',
  });

  await page.goto(`/groups/${id}/contacts/${contact}/edit`);
  await expect(page.getByText('Glavni trg 1')).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Razčleni naslov' }).click();

  const address = page.getByRole('group', { name: 'Naslov', exact: true });
  const street = address.getByRole('combobox', { name: 'Ulica in hišna številka' });
  await expect(street).toBeFocused();
  await expect(street).toHaveValue('Glavni trg 1');
  await expect(address.getByRole('textbox', { name: 'Poštna številka' })).toHaveValue('2000');
  await expect(address.getByRole('combobox', { name: 'Kraj', exact: true })).toHaveValue('Maribor');
  // Dokler uporabnik ne shrani, se na strežniku nič ne spremeni.
  expect(addressTextOf(contact)).toBe('Glavni trg 1\n2000 Maribor');
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Bojan Star je shranjen.');
  expect(addressTextOf(contact)).toBe('');
  expect(addressPartsOf(contact)).toEqual({
    street: 'Glavni trg 1',
    postalCode: '2000',
    city: 'Maribor',
  });
});

// US4: izbira prikazne sheme v Mojem računu; strežnik in izvoz ostaneta kanonična.
test('FR-016-16 FR-016-17 FR-016-18: shema telefona in datuma v Mojem računu spremeni prikaz, velja po ponovni prijavi, API je kanoničen', async ({
  page,
  browser,
}) => {
  const user = await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const phone = createContactWithTypedAttribute(
    id,
    'Ana Telefon',
    'Mobilni',
    '+436641234567',
    'PHONE',
  );
  const date = createContactWithTypedAttribute(
    id,
    'Bojan Datum',
    'Rojstni dan',
    '2026-11-16',
    'DATE',
  );

  await page.goto(`/groups/${id}/contacts/${phone}`);
  await expect(page.getByRole('link', { name: '+43 664 1234567' })).toBeVisible();
  await page.goto(`/groups/${id}/contacts/${date}`);
  await expect(page.getByText('16. 11. 2026')).toBeVisible();

  await page.goto('/account');
  const formats = page.getByRole('region', { name: 'Oblika zapisa' });
  await expect(formats).toBeVisible();
  await expectNoAxeViolations(page);
  await formats.getByRole('radio', { name: /^Nacionalna/ }).check();
  await formats.getByRole('radio', { name: /^Dolga oblika/ }).check();
  await expect(formats.getByRole('status')).toContainText('Oblika zapisa je shranjena.');
  await expectNoAxeViolations(page);

  // Po osvežitvi strani velja izbira iz profila.
  await page.goto(`/groups/${id}/contacts/${phone}`);
  await expect(page.getByRole('link', { name: '0664 1234567' })).toHaveAttribute(
    'href',
    'tel:+436641234567',
  );
  await page.goto(`/groups/${id}/contacts/${date}`);
  await expect(page.getByText('16. november 2026')).toBeVisible();
  await expectNoAxeViolations(page);

  // Ponovna prijava na drugi napravi: izbira velja (profil), API in izvoz pa ostaneta kanonična.
  const other = await browser.newContext({ locale: 'sl-SI' });
  const second = await other.newPage();
  await second.goto('/');
  await signIn(second, user);
  await second.goto('/account');
  const secondFormats = second.getByRole('region', { name: 'Oblika zapisa' });
  await expect(secondFormats.getByRole('radio', { name: /^Nacionalna/ })).toBeChecked();
  await expect(secondFormats.getByRole('radio', { name: /^Dolga oblika/ })).toBeChecked();

  const headers = { Authorization: `Bearer ${await idToken(second)}` };
  const contact = await second.request.get(`/api/groups/${id}/contacts/${phone}`, { headers });
  expect(await contact.text()).toContain('+436641234567');
  const exported = await second.request.get('/api/me/export', { headers });
  const profile = ((await exported.json()) as { profile: Record<string, unknown> }).profile;
  expect(profile).toMatchObject({
    phoneFormat: 'NATIONAL',
    dateFormat: 'LONG',
    addressFormat: null,
  });
  await other.close();
});
