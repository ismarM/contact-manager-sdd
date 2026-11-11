import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import {
  createContactsBulk,
  createContactsWithEmails,
  createManyDistinctTags,
  createSearchContact,
  createSearchSet,
} from './support/contacts';
import { archive, createGroup, setRole } from './support/groups';

// 008 iskanje, filtri in razvrščanje (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px. Zadetki in
// vrstni redi so dobesedni (D-63: slovenska abeceda ne glede na jezik vmesnika). Podatke pripravi SQL (D-27).

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

/** Nov brskalnik z danim jezikom, v katerem je prijavljen obstoječ ali nov uporabnik. */
async function inLocale(browser: Browser, page: Page, locale: string, user: TestUser) {
  const context = await browser.newContext({ locale, viewport: page.viewportSize() ?? undefined });
  const other = await context.newPage();
  await other.goto('/');
  await signIn(other, user);
  await expect(other.getByRole('button', { name: /^(Meni računa|Account menu)$/ })).toBeVisible();
  return { context, page: other };
}

const searchArea = (page: Page, name = 'Iskanje in filtri') => page.getByRole('search', { name });
const table = (page: Page, group = 'Kontakti skupine Projekt FERI') =>
  page.getByRole('table', { name: group });
const rows = (page: Page, group?: string) => table(page, group).getByRole('rowheader');

/** Parametri poizvedbe v naslovu strani. */
const params = (page: Page) => new URL(page.url()).searchParams;

// Brskalnik v istem časovnem pasu kot proces testa (kot 004).
test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

const DEFAULT_ORDER = [
  'Bojan Čeh',
  'Mojca Kralj',
  'Janez Novak',
  'Maja Šuligoj',
  'Cene Zupančič',
  'Eva Žagar',
  'Ana',
];

test('FR-008-01 FR-008-02 FR-008-10 FR-008-13: iskanje po kontaktih – deli e-naslova, šumniki, število zadetkov, prazno stanje', async ({
  page,
}) => {
  const user = await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);
  setRole(id, user.email, 'VIEWER');

  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);
  const area = searchArea(page);
  const box = area.getByRole('searchbox', { name: 'Iskanje po kontaktih' });

  await box.fill('feri');
  await expect(rows(page)).toHaveText(['Janez Novak', 'Eva Žagar']);
  await expect(area.getByRole('status')).toHaveText('Najdena 2 kontakta');
  expect(params(page).get('q')).toBe('feri');

  await box.fill('ZUPANC');
  await expect(rows(page)).toHaveText(['Cene Zupančič']);
  await expect(area.getByRole('status')).toHaveText('Najden 1 kontakt');
  await box.fill('zupanč');
  await expect(rows(page)).toHaveText(['Cene Zupančič']);
  await box.fill('ceh');
  await expect(rows(page)).toHaveText(['Bojan Čeh']);

  await box.fill('janez novak');
  await expect(rows(page)).toHaveText(['Janez Novak']);

  // dodatni atributi in značke niso del prostega iskanja (FR-008-01)
  await box.fill('web dev');
  await expect(
    page.getByRole('heading', { level: 3, name: 'Ni kontaktov, ki ustrezajo filtrom.' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  // gumb v praznem stanju/opozorilu je zadnji v `main` (ob oznakah je prvi, v območju iskanja)
  await page.getByRole('main').getByRole('button', { name: 'Počisti filtre' }).last().click();
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);
  await expect(box).toHaveValue('');
  expect(params(page).get('q')).toBeNull();
});

test('FR-008-03 FR-008-04 FR-008-05 FR-008-06 FR-008-11 FR-008-12: filtri samo s tipkovnico – pogoj, znački, oznake, fokus, počisti', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);
  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);
  const area = searchArea(page);

  const filters = area.getByRole('button', { name: 'Filtri', exact: true });
  await filters.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('group', { name: 'Filtri kontaktov' });
  await expect(panel).toBeVisible();

  const attribute = panel.getByRole('combobox', { name: 'Atribut 1' });
  await expect(attribute.getByRole('option')).toHaveText([
    'Ime',
    'Priimek',
    'Naslov',
    'E-naslov',
    'Telefon',
    'kompetenca',
    'podjetje',
  ]);
  await attribute.selectOption('kompetenca');
  await panel.getByRole('textbox', { name: 'Vrednost 1' }).fill('web');
  const tags = panel.getByRole('group', { name: 'Značke' });
  await tags.getByRole('checkbox', { name: 'vip' }).focus();
  await page.keyboard.press('Space');
  await tags.getByRole('checkbox', { name: 'konferenca2025' }).focus();
  await page.keyboard.press('Space');
  await panel.getByRole('button', { name: 'Uporabi filtre' }).focus();
  await page.keyboard.press('Enter');

  await expect(rows(page)).toHaveText(['Janez Novak']);
  await expect(area.getByRole('button', { name: 'Filtri (3)' })).toBeVisible();
  expect(params(page).getAll('f')).toEqual(['x.kompetenca:web']);
  expect(params(page).getAll('tag')).toEqual(['vip', 'konferenca2025']);
  const chips = area.getByRole('list', { name: 'Uporabljeni filtri' });
  await expect(chips.getByRole('listitem')).toHaveCount(3);
  await expectNoAxeViolations(page);

  // odstranitev oznake z Enter: seznam se osveži, fokus ostane v območju oznak
  const removeFirst = chips.getByRole('button', { name: 'Odstrani filter kompetenca vsebuje web' });
  await removeFirst.focus();
  await page.keyboard.press('Enter');
  // ostaneta znački vip in konferenca2025: obe ima samo Janez Novak
  await expect(rows(page)).toHaveText(['Janez Novak']);
  await expect(area.getByRole('button', { name: 'Filtri (2)' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Odstrani filter Značka: vip' })).toBeFocused();

  await area.getByRole('button', { name: 'Počisti filtre' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);
  await expect(area.getByRole('button', { name: 'Filtri', exact: true })).toBeVisible();
  expect(params(page).getAll('tag')).toEqual([]);
});

test('FR-008-05: iskalni niz, pogoj in značka skupaj; pogoj nad predefiniranim poljem', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);
  await page.goto(`/groups/${id}/contacts?q=feri&tag=vip&f=phone%3A041`);

  await expect(rows(page)).toHaveText(['Janez Novak']);
  const area = searchArea(page);
  await expect(area.getByRole('button', { name: 'Filtri (2)' })).toBeVisible();
  await expect(area.getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toHaveValue('feri');
});

test('FR-008-07 SC-003: razvrščanje po slovenski abecedi – isti vrstni red v slovenskem in angleškem vmesniku', async ({
  page,
  browser,
}) => {
  const user = await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);
  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);

  const area = searchArea(page);
  await area.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }).click();
  await expect(rows(page)).toHaveText([
    'Eva Žagar',
    'Cene Zupančič',
    'Maja Šuligoj',
    'Janez Novak',
    'Mojca Kralj',
    'Bojan Čeh',
    'Ana',
  ]);
  await expect(area.getByRole('button', { name: 'Smer razvrščanja: padajoče' })).toBeVisible();

  const english = await inLocale(browser, page, 'en-US', user);
  await english.page.goto(`/groups/${id}/contacts`);
  await expect(rows(english.page, 'Contacts of group Projekt FERI')).toHaveText(DEFAULT_ORDER);
  await english.page.goto(`/groups/${id}/contacts?dir=desc`);
  await expect(rows(english.page, 'Contacts of group Projekt FERI')).toHaveText([
    'Eva Žagar',
    'Cene Zupančič',
    'Maja Šuligoj',
    'Janez Novak',
    'Mojca Kralj',
    'Bojan Čeh',
    'Ana',
  ]);
  await english.context.close();
});

test('FR-008-07: razvrščanje po dodatnem atributu (brez vrednosti na koncu) in z gumbom v glavi stolpca', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);
  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);
  const area = searchArea(page);

  await area.getByRole('combobox', { name: 'Razvrsti' }).selectOption('podjetje');
  await expect(rows(page).first()).toHaveText('Eva Žagar');
  await expect(rows(page).nth(1)).toHaveText('Cene Zupančič');
  await expect(rows(page).last()).not.toHaveText(/Žagar|Zupančič/);
  expect(params(page).get('sort')).toBe('x.podjetje');

  await area.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }).click();
  await expect(rows(page).first()).toHaveText('Cene Zupančič');
  await expect(rows(page).nth(1)).toHaveText('Eva Žagar');

  // Glave stolpcev pod 640 px vsebnika ne obstajajo (kartice, design.md 8.6): razvrščanje tam pokrivata izbira »Razvrsti« in
  // gumb smeri zgoraj; gumbe v glavah preverimo od 640 px naprej.
  const narrow = (page.viewportSize()?.width ?? 0) < 640;
  if (!narrow) {
    await area.getByRole('combobox', { name: 'Razvrsti' }).selectOption('Priimek');
    const header = table(page).getByRole('columnheader', { name: 'E-naslov' });
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
  }
});

test('FR-008-06: bralec dobi enak panel in rezultate kot urednik; axe pri odprtem panelu in praznem stanju', async ({
  page,
}) => {
  const user = await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);

  // lastnik (najmanj urednik): rezultati in možnosti panela
  await page.goto(`/groups/${id}/contacts?tag=vip`);
  await expect(rows(page)).toHaveText(['Mojca Kralj', 'Janez Novak']);
  await searchArea(page)
    .getByRole('button', { name: /^Filtri/ })
    .click();
  const ownerOptions = await page
    .getByRole('combobox', { name: 'Atribut 1' })
    .getByRole('option')
    .allInnerTexts();
  const ownerTags = await page
    .getByRole('group', { name: 'Značke' })
    .getByRole('checkbox')
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute('aria-label') ?? box.id));

  setRole(id, user.email, 'VIEWER');
  await page.goto(`/groups/${id}/contacts?tag=vip`);

  await expect(rows(page)).toHaveText(['Mojca Kralj', 'Janez Novak']);
  const area = searchArea(page);
  await area.getByRole('button', { name: /^Filtri/ }).click();
  await expect(page.getByRole('group', { name: 'Filtri kontaktov' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Atribut 1' }).getByRole('option')).toHaveText(
    ownerOptions,
  );
  expect(ownerTags.length).toBeGreaterThan(0);
  await expect(page.getByRole('group', { name: 'Značke' }).getByRole('checkbox')).toHaveCount(
    ownerTags.length,
  );
  await expect(
    page.getByRole('group', { name: 'Značke' }).getByRole('checkbox', { name: 'vip' }),
  ).toBeChecked();
  await expectNoAxeViolations(page);
  await expect(page.getByRole('link', { name: 'Nov kontakt' })).toHaveCount(0);
});

test('FR-008-04 FR-008-06 SC-005: 1000 značk – iskanje značke, izbira s tipkovnico, axe', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createManyDistinctTags(id, 1000);
  await page.goto(`/groups/${id}/contacts`);
  const area = searchArea(page);

  await area.getByRole('button', { name: 'Filtri', exact: true }).click();
  const panel = page.getByRole('group', { name: 'Filtri kontaktov' });
  const tags = panel.getByRole('group', { name: 'Značke' });
  await expect(tags.getByRole('checkbox', { name: 'znacka0001' })).toBeVisible();
  expect(await tags.getByRole('checkbox').count()).toBeLessThanOrEqual(100);
  await expect(panel.getByRole('status')).toContainText('Značke: prikazanih 100 od 1000');

  const find = panel.getByRole('searchbox', { name: 'Poišči značko' });
  await find.fill('znacka0512');
  await expect(tags.getByRole('checkbox')).toHaveCount(1);
  await expect(panel.getByRole('status')).toContainText('Značke: prikazanih 1 od 1');
  await tags.getByRole('checkbox', { name: 'znacka0512' }).focus();
  await page.keyboard.press('Space');
  await expect(tags.getByRole('checkbox', { name: 'znacka0512' })).toBeChecked();
  await find.fill('znacka07');
  await expect(tags.getByRole('checkbox', { name: 'znacka0512' })).toBeChecked();
  await expectNoAxeViolations(page);

  await panel.getByRole('button', { name: 'Uporabi filtre' }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(params(page).getAll('tag')).toEqual(['znacka0512']);
});

// --- FR-008-08, FR-008-09, FR-008-14 … FR-008-17, SC-002, SC-005 ---

test('FR-008-08: 312 kontaktov – obseg, strani, velikost strani, ponastavitev strani, stran onkraj zadnje', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createContactsBulk(id, 312);
  await page.goto(`/groups/${id}/contacts`);
  const pagination = page.getByRole('navigation', { name: 'Strani rezultatov' });

  await expect(pagination.getByRole('status')).toHaveText('1–25 od 312');
  await expect(pagination).toContainText('Stran 1 od 13');
  await pagination.getByRole('combobox', { name: 'Velikost strani' }).selectOption('100');
  await expect(pagination.getByRole('status')).toHaveText('1–100 od 312');
  await pagination.getByRole('button', { name: 'Naslednja' }).click();
  await pagination.getByRole('button', { name: 'Naslednja' }).click();
  await expect(pagination.getByRole('status')).toHaveText('201–300 od 312');
  expect(params(page).get('page')).toBe('3');

  // sprememba iskanja ponastavi stran na 1 (Ime30x: 300 do 309)
  await searchArea(page).getByRole('searchbox', { name: 'Iskanje po kontaktih' }).fill('Ime30');
  await expect(searchArea(page).getByRole('status')).toHaveText('Najdenih 10 kontaktov');
  expect(params(page).get('page')).toBeNull();

  await page.goto(`/groups/${id}/contacts?page=20`);
  await expect(pagination.getByRole('status')).toHaveText('301–312 od 312');
  expect(params(page).get('page')).toBe('13');
});

test('FR-008-09 SC-003: deljena povezava – drug član v angleškem vmesniku vidi enako stanje in vrstni red; osvežitev, Nazaj/Naprej', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);
  await page.goto(`/groups/${id}/contacts`);
  const area = searchArea(page);
  await area.getByRole('searchbox', { name: 'Iskanje po kontaktih' }).fill('a');
  await area.getByRole('combobox', { name: 'Razvrsti' }).selectOption('E-naslov');
  await area.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }).click();
  await expect(area.getByRole('button', { name: 'Smer razvrščanja: padajoče' })).toBeVisible();
  await page.waitForURL(/dir=desc/);
  const shared = page.url();
  // iskanje »a« najde vseh 7 kontaktov; po e-naslovu padajoče (mojca > maja > janez > eva > cene > bojan), brez e-naslova na koncu
  const names = [
    'Mojca Kralj',
    'Maja Šuligoj',
    'Janez Novak',
    'Eva Žagar',
    'Cene Zupančič',
    'Bojan Čeh',
    'Ana',
  ];
  await expect(rows(page)).toHaveText(names);

  // osvežitev
  await page.reload();
  await expect(rows(page)).toHaveText(names);
  expect(page.url()).toBe(shared);

  // drug član iste skupine v angleškem vmesniku odpre isto povezavo
  const second = uniqueUser('Bojan Kralj');
  const english = await browser.newContext({
    locale: 'en-US',
    viewport: page.viewportSize() ?? undefined,
  });
  const other = await english.newPage();
  await other.goto('/');
  await signIn(other, second);
  await expect(other.getByRole('button', { name: 'Account menu' })).toBeVisible();
  setRole(id, second.email, 'VIEWER');
  await other.goto(new URL(shared).pathname + new URL(shared).search);
  await expect(rows(other, 'Contacts of group Projekt FERI')).toHaveText(names);
  const otherArea = searchArea(other, 'Search and filters');
  await expect(otherArea.getByRole('searchbox', { name: 'Search contacts' })).toHaveValue('a');
  await expect(
    otherArea
      .getByRole('combobox', { name: 'Sort by' })
      .getByRole('option', { name: 'Email', selected: true }),
  ).toBeAttached();
  await expect(otherArea.getByRole('button', { name: 'Sort direction: descending' })).toBeVisible();
  await english.close();

  // Nazaj po odprtju kontakta ohrani stanje seznama
  await rows(page).first().getByRole('link').click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}/);
  await page.goBack();
  await expect(rows(page)).toHaveText(names);
  expect(page.url()).toBe(shared);
  await page.goBack();
  await page.goForward();
  await expect(rows(page)).toHaveText(names);
});

test('FR-008-14 FR-008-17: ročno spremenjen naslov in odpoved povezave', async ({ page }) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);

  await page.goto(`/groups/${id}/contacts?f=x.skrivno%3Aabc`);
  await expect(page.getByRole('alert')).toContainText('Filtri niso veljavni.');
  await expectNoAxeViolations(page);
  // gumb v praznem stanju/opozorilu je zadnji v `main` (ob oznakah je prvi, v območju iskanja)
  await page.getByRole('main').getByRole('button', { name: 'Počisti filtre' }).last().click();
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);

  await page.goto(`/groups/${id}/contacts?q=${'a'.repeat(201)}`);
  await expect(page.getByRole('alert')).toContainText('Filtri niso veljavni.');

  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);
  await page.route('**/api/groups/*/contacts?*q=*', (route) => route.abort());
  await searchArea(page).getByRole('searchbox', { name: 'Iskanje po kontaktih' }).fill('janez');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Kontaktov ni bilo mogoče naložiti. Poskusi znova.');
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);
  await page.unroute('**/api/groups/*/contacts?*q=*');
  await alert.getByRole('button', { name: 'Poskusi znova' }).click();
  await expect(rows(page)).toHaveText(['Janez Novak']);
  await expect(alert).toHaveCount(0);
});

test('FR-008-15: arhivirana skupina – iskanje, filtri in razvrščanje delujejo', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(id);
  archive(id);
  await page.goto(`/groups/${id}/contacts`);
  const area = searchArea(page);
  await expect(rows(page)).toHaveText(DEFAULT_ORDER);

  await area.getByRole('searchbox', { name: 'Iskanje po kontaktih' }).fill('feri');
  await expect(rows(page)).toHaveText(['Janez Novak', 'Eva Žagar']);
  await area.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }).click();
  await expect(rows(page)).toHaveText(['Eva Žagar', 'Janez Novak']);
  await area.getByRole('button', { name: 'Filtri', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Filtri kontaktov' }).getByRole('group', { name: 'Značke' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nov kontakt' })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('FR-008-16: član dveh skupin – iskanje in možnosti filtrov ne razkrijejo podatkov druge skupine', async ({
  page,
}) => {
  await signedIn(page);
  const first = await createGroup(page, { title: 'Projekt FERI' });
  createSearchSet(first);
  const second = await createGroup(page, { title: 'Druga skupina' });
  createSearchContact(second, {
    first: 'Tuja',
    last: 'Oseba',
    email: 'tuja@skrivno.si',
    attributes: [['skrivno', 'podatek']],
    tags: ['tajno'],
  });

  await page.goto(`/groups/${first}/contacts`);
  const area = searchArea(page);
  await area.getByRole('searchbox', { name: 'Iskanje po kontaktih' }).fill('tuja');
  await expect(
    page.getByRole('heading', { level: 3, name: 'Ni kontaktov, ki ustrezajo filtrom.' }),
  ).toBeVisible();
  await page.goto(`/groups/${first}/contacts`);
  await area.getByRole('button', { name: 'Filtri', exact: true }).click();
  const panel = page.getByRole('group', { name: 'Filtri kontaktov' });
  await expect(panel.getByRole('checkbox', { name: 'vip' })).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: 'tajno' })).toHaveCount(0);
  await expect(
    panel.getByRole('combobox', { name: 'Atribut 1' }).getByRole('option', { name: 'skrivno' }),
  ).toHaveCount(0);
});

test('SC-002 SC-005: 500 kontaktov – iskanje samo s tipkovnico v manj kot 15 s, brez kršitev axe pri 320 px in brez vodoravnega drsenja', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createContactsWithEmails(id, 500);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page).first()).toBeVisible();
  const started = Date.now();

  const box = searchArea(page).getByRole('searchbox', { name: 'Iskanje po kontaktih' });
  await box.focus();
  await page.keyboard.type('oseba377');
  await expect(rows(page)).toHaveText(['Ime377 Priimek377']);
  await page.keyboard.press('Tab');
  await expect(searchArea(page).getByRole('button', { name: 'Filtri', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Filtri kontaktov' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(searchArea(page).getByRole('button', { name: 'Filtri', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(searchArea(page).getByRole('combobox', { name: 'Razvrsti' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(searchArea(page).getByRole('button', { name: /^Smer razvrščanja/ })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(Date.now() - started).toBeLessThan(15_000);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoAxeViolations(page);
});
