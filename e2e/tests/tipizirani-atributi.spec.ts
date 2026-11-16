import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { idToken } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import { seedContact } from './support/duplicates';
import { createGroup, setRole, sql } from './support/groups';
import { NAMES, xlsxBuffer } from './support/importExport';
import { readXlsx } from './support/xlsx';
import { createSearchContact } from './support/contacts';
import {
  addressPartsOf,
  addressTextOf,
  auditActions,
  createContactWithTypedAttribute,
  keyTypeOf,
  setAddressParts,
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

// --- US5: zemljevid za naslove (zaledje kliče osm-stub: Nominatim in ploščice; brskalnik samo naš izvor) -------------

/** Izvori vseh zahtev HTTP brskalnika (brez `blob:` in `data:`). */
function trackOrigins(page: Page) {
  const origins = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') origins.add(url.origin);
  });
  return origins;
}

test('FR-016-20 FR-016-21 FR-016-23 @w768: zemljevid razčlenjenega naslova s ploščicami prek našega strežnika, tipkovnica in pripis', async ({
  page,
}) => {
  const origins = trackOrigins(page);
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const contact = createSearchContact(id, { first: 'Ana', last: 'Zemljevid' });
  setAddressParts(contact, {
    street: 'Slovenska cesta 1',
    postalCode: '1000',
    city: 'Ljubljana',
    country: 'SI',
  });

  await page.goto(`/groups/${id}/contacts/${contact}`);
  const button = page.getByRole('button', { name: 'Pokaži na zemljevidu: Naslov' });
  await button.click();

  const dialog = page.getByRole('dialog', { name: 'Zemljevid: Naslov' });
  const map = dialog.getByRole('region', { name: /^Zemljevid: Naslov\./ });
  await expect(map).toBeVisible();
  await expect(dialog).toContainText('Slovenska cesta 1');
  await expect(dialog).toContainText(
    'Oznaka je na lokaciji naslova (geografska širina 46,05120, dolžina 14,50510).',
  );
  await expect(dialog.getByRole('link', { name: '© prispevalci OpenStreetMap' })).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Odpri lokacijo v OpenStreetMap (odpre se v novem zavihku)' }),
  ).toBeVisible();
  // Ploščice so naložene prek /api/map-tiles in prikazane kot blob: URL.
  await expect
    .poll(() =>
      map
        .locator('img')
        .evaluateAll(
          (images) =>
            images.filter((image) => (image as HTMLImageElement).src.startsWith('blob:')).length,
        ),
    )
    .toBeGreaterThan(0);
  await expectNoAxeViolations(page);

  await dialog.getByRole('button', { name: 'Povečaj' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  // Brskalnik ne kliče tujih strežnikov (FR-016-23, SC-006).
  expect([...origins]).toEqual([new URL(page.url()).origin]);
});

test('FR-016-22: nenajden, približen in nedosegljiv naslov atributa so sporočila; Poskusi znova', async ({
  page,
}) => {
  const origins = trackOrigins(page);
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const missing = createContactWithTypedAttribute(
    id,
    'Neznan',
    'Dostava',
    'Neznana ulica 99\n9999 Atlantida',
    'ADDRESS',
  );
  const approximate = createContactWithTypedAttribute(
    id,
    'Približen',
    'Dostava',
    'Maribor',
    'ADDRESS',
  );
  const offline = createContactWithTypedAttribute(
    id,
    'Nedosegljiv',
    'Dostava',
    'Nedosegljiva ulica 1',
    'ADDRESS',
  );

  await page.goto(`/groups/${id}/contacts/${missing}`);
  await page.getByRole('button', { name: 'Pokaži na zemljevidu: Dostava' }).click();
  let dialog = page.getByRole('dialog', { name: 'Zemljevid: Dostava' });
  await expect(dialog.getByText('Naslova ni bilo mogoče najti na zemljevidu.')).toBeVisible();
  await expect(dialog.getByRole('region')).toHaveCount(0);
  await expect(
    dialog.getByRole('link', { name: 'Poišči naslov v OpenStreetMap (odpre se v novem zavihku)' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');

  await page.goto(`/groups/${id}/contacts/${approximate}`);
  await page.getByRole('button', { name: 'Pokaži na zemljevidu: Dostava' }).click();
  dialog = page.getByRole('dialog', { name: 'Zemljevid: Dostava' });
  await expect(dialog.getByRole('region', { name: /^Zemljevid: Dostava\./ })).toBeVisible();
  await expect(
    dialog.getByText('Lokacija je približna: najden je bil kraj ali ulica, ne hišna številka.'),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');

  await page.goto(`/groups/${id}/contacts/${offline}`);
  await page.getByRole('button', { name: 'Pokaži na zemljevidu: Dostava' }).click();
  dialog = page.getByRole('dialog', { name: 'Zemljevid: Dostava' });
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Zemljevid trenutno ni na voljo.');
  await expectNoAxeViolations(page);
  const retry = page.waitForResponse((response) => response.url().includes('/address-location'));
  await alert.getByRole('button', { name: 'Poskusi znova' }).click();
  expect((await retry).status()).toBe(503);
  await expect(dialog.getByRole('alert')).toContainText('Zemljevid trenutno ni na voljo.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 2, name: 'Nedosegljiv' })).toBeVisible();

  expect([...origins]).toEqual([new URL(page.url()).origin]);
});

// US6: tipi v uvozu, izvozu, sledi, rollbacku in zgodovini kontakta.
test('FR-016-24 FR-016-25: uvoz Excela s tipom Telefon in deli naslova, izvoz je kanoničen', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Uvoz s tipi' });
  const file = await xlsxBuffer([
    ['Ime', 'Priimek', 'Ulica', 'Kraj', 'Mobitel'],
    ['Ana', 'Kos', 'Trg 1', 'Ljubljana', '041 123 456'],
  ]);

  await page.goto(`/groups/${id}/contacts`);
  await page.getByRole('button', { name: NAMES.importMenu }).click();
  await page.getByRole('menuitem', { name: NAMES.fromExcel }).click();
  await page
    .getByLabel(NAMES.xlsxFile)
    .setInputFiles({ name: 'kontakti.xlsx', mimeType: 'application/octet-stream', buffer: file });
  await page.getByRole('button', { name: NAMES.read }).click();

  await page
    .getByLabel('Uvozi stolpec Ulica v')
    .selectOption({ label: 'Naslov: ulica in hišna številka' });
  await page.getByLabel('Uvozi stolpec Kraj v').selectOption({ label: 'Naslov: kraj' });
  await expect(page.getByLabel('Ključ atributa za stolpec Mobitel')).toHaveValue('Mobitel');
  await page.getByLabel('Tip ključa za stolpec Mobitel').selectOption({ label: 'Telefon' });
  const confirm = page.getByRole('button', { name: NAMES.confirm(1) });
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole('table', { name: 'Vrstice za uvoz' })).toContainText('Trg 1');
  await expectNoAxeViolations(page);
  await confirm.click();

  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts$`));
  expect(keyTypeOf(id, 'Mobitel')).toBe('PHONE');
  expect(valuesOfKey(id, 'Mobitel')).toEqual(['+38641123456']);
  const contact = sql(`select id from contact where group_id = '${id}'::uuid`);
  expect(addressPartsOf(contact)).toEqual({ street: 'Trg 1', city: 'Ljubljana' });
  expect(auditActions(id)).toEqual(['IMPORT']);

  // Izvoz ostane kanoničen: telefon E.164, naslov po pravilih države (ne po shemi uporabnika).
  await page.getByRole('checkbox', { name: 'Izberi Ana Kos', exact: true }).check();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('toolbar', { name: 'Dejanja izbora' })
    .getByRole('button', { name: 'Izvozi v Excel' })
    .click();
  const exported = await readXlsx(await (await downloading).path());
  const cells = exported.rows.flat();
  expect(cells).toContain('+38641123456');
  expect(cells.some((cell) => cell.includes('Trg 1') && cell.includes('Ljubljana'))).toBe(true);
});

test('FR-016-26: sprememba tipa ključa v sledi in zgodovini kontakta, rollback na začetno stanje vrne tip in vrednost', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Sled tipov' });
  const contact = createContactWithTypedAttribute(id, 'Ana Prva', 'Mobilni', '041 123 456');

  await openAttributes(page, id);
  await page.getByRole('button', { name: 'Spremeni tip ključa Mobilni' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sprememba tipa ključa' });
  await dialog.getByRole('combobox', { name: 'Novi tip' }).selectOption({ label: 'Telefon' });
  await dialog.getByRole('button', { name: 'Spremeni tip', exact: true }).click();
  await expect(toast(page)).toContainText('Tip ključa »Mobilni« je spremenjen.');
  expect(keyTypeOf(id, 'Mobilni')).toBe('PHONE');
  expect(valuesOfKey(id, 'Mobilni')).toEqual(['+38641123456']);

  // Sled: en vnos s ključem in tipoma; podrobnosti pokažejo vrednost pred in po s pripisom spremembe tipa.
  await page.goto(`/groups/${id}/audit`);
  const trail = page.getByRole('list', { name: 'Vnosi revizijske sledi' });
  const entry = trail.getByRole('listitem').first();
  await expect(entry).toContainText(
    'spremenil(a) tip ključa »Mobilni« iz Drugo v Telefon (1 kontakt)',
  );
  await entry.getByRole('group', { name: 'Podrobnosti' }).click();
  await entry
    .getByRole('list', { name: 'Prizadeti kontakti' })
    .getByRole('group', { name: 'Ana Prva' })
    .click();
  const table = entry.getByRole('table', { name: 'Spremembe kontakta Ana Prva' });
  await expect(table.getByRole('row', { name: /Mobilni/ })).toContainText('tip: Drugo → Telefon');
  await expect(table.getByRole('row', { name: /Mobilni/ })).toContainText('041 123 456');
  await expect(table.getByRole('row', { name: /Mobilni/ })).toContainText('+386 41 123 456');
  await expectNoAxeViolations(page);

  // Zgodovina kontakta kaže isto spremembo.
  await page.goto(`/groups/${id}/contacts/${contact}/history`);
  const events = page.getByRole('list', { name: 'Dogodki zgodovine kontakta' });
  await expect(events.getByRole('listitem')).toHaveCount(1);
  await events.getByRole('listitem').first().getByRole('group', { name: 'Podrobnosti' }).click();
  await expect(page.getByRole('table', { name: 'Spremembe kontakta Ana Prva' })).toContainText(
    'tip: Drugo → Telefon',
  );
  await expectNoAxeViolations(page);

  // Rollback skupine na začetno stanje vrne prejšnji tip in vrednost dobesedno.
  await page.goto(`/groups/${id}/audit`);
  const initial = trail.getByRole('listitem').filter({ hasText: /Začetno stanje/ });
  await initial.getByRole('button', { name: 'Povrni skupino na to točko' }).click();
  const rollback = page.getByRole('dialog', { name: 'Povrnem skupino na začetno stanje?' });
  await expectNoAxeViolations(page);
  await rollback.getByRole('button', { name: 'Povrni skupino' }).click();

  await expect(toast(page)).toContainText('Skupina je povrnjena na začetno stanje.');
  expect(keyTypeOf(id, 'Mobilni')).toBe('OTHER');
  expect(valuesOfKey(id, 'Mobilni')).toEqual(['041 123 456']);
  expect(auditActions(id)).toEqual(['ATTRIBUTE_TYPE', 'ROLLBACK']);
});
