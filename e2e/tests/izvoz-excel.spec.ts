import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { auditEntryCount } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import {
  addTagInDb,
  createContactWithAttributes,
  createSearchContact,
  createTaggedContacts,
} from './support/contacts';
import { archive, createGroup, setRole } from './support/groups';
import { localDate } from './support/myData';
import { readXlsx } from './support/xlsx';

// Priprava podatkov (SQL prek Dockerja), več uporabnikov in axe presežejo privzetih 30 s (D-79).
test.describe.configure({ timeout: 90_000 });

// 010 izvoz izbranih kontaktov v Excel (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px. Datoteka se
// prenese in prebere nazaj z `exceljs` (workflow.md §2.9). Podatke pripravi SQL (D-27).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const HEADER_SL = ['Ime', 'Priimek', 'Naslov', 'E-naslov', 'Telefon'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function signedIn(page: Page, name = 'Ana Novak'): Promise<TestUser> {
  const user = uniqueUser(name);
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: /^(Meni računa|Account menu)$/ })).toBeVisible();
  return user;
}

/** Drug član v ločenem kontekstu brskalnika. */
async function otherUser(browser: Browser, page: Page, name: string, locale = 'sl-SI') {
  const context = await browser.newContext({ locale, viewport: page.viewportSize() ?? undefined });
  const other = await context.newPage();
  const user = await signedIn(other, name);
  return { context, page: other, user };
}

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Dejanja izbora' });
const status = (page: Page) => toolbar(page).getByRole('status');
const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const exportButton = (page: Page) => toolbar(page).getByRole('button', { name: 'Izvozi v Excel' });
const pick = (page: Page, label: string) =>
  page.getByRole('checkbox', { name: `Izberi ${label}`, exact: true });
const rows = (page: Page, group: string) =>
  page.getByRole('table', { name: `Kontakti skupine ${group}` }).getByRole('rowheader');
const pagination = (page: Page) => page.getByRole('navigation', { name: 'Strani rezultatov' });

/** Klik na *Izvozi v Excel* in prebrana prenesena datoteka z imenom. */
async function exportAndRead(page: Page, button = exportButton(page)) {
  const downloading = page.waitForEvent('download');
  await button.click();
  const download = await downloading;
  const path = await download.path();
  return { name: download.suggestedFilename(), file: await readXlsx(path) };
}

test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

test('FR-010-01 FR-010-02 FR-010-03 FR-010-10 FR-010-14 FR-010-15 SC-001 SC-003: bralec izvozi dva kontakta z različnih strani – ime, list, glava, vrstici, toast, izbor ostane, sled nespremenjena', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createTaggedContacts(id, 30, 'konferenca2025');
  createSearchContact(id, {
    first: 'Ana',
    last: 'Kos',
    email: 'ana@kos.si',
    phone: '041 123 456',
    address: 'Glavni trg 1\nMaribor',
    tags: ['konferenca2025'],
  });
  createSearchContact(id, { first: 'Bor', last: 'Zupan', email: 'bor@zupan.si' });
  const viewer = await otherUser(browser, page, 'Vesna Bralec');
  setRole(id, viewer.user.email, 'VIEWER');
  const auditBefore = auditEntryCount(id);
  const v = viewer.page;

  await v.goto(`/groups/${id}/contacts`);
  await expect(rows(v, 'Projekt FERI')).toHaveCount(25);
  await expect(toolbar(v)).toHaveCount(0);
  await expect(v.getByRole('button', { name: 'Izvozi v Excel' })).toHaveCount(0);

  await pick(v, 'Ana Kos').check();
  await expect(exportButton(v)).toBeVisible();
  await pagination(v).getByRole('button', { name: 'Naslednja' }).click();
  await expect(pagination(v).getByRole('status')).toHaveText('26–32 od 32');
  await pick(v, 'Bor Zupan').check();
  await expect(status(v)).toHaveText('Izbrana: 2');
  await expectNoAxeViolations(v);

  const { name, file } = await exportAndRead(v);
  expect(name).toBe(`Projekt-FERI-kontakti-${localDate()}.xlsx`);
  expect(file.sheetNames).toEqual(['Kontakti']);
  expect(file.rows).toEqual([
    [...HEADER_SL, 'Značke'],
    ['Ana', 'Kos', 'Glavni trg 1\nMaribor', 'ana@kos.si', '041 123 456', 'konferenca2025'],
    ['Bor', 'Zupan', '', 'bor@zupan.si', '', ''],
  ]);
  expect(file.hasFormula).toBe(false);
  expect(file.cellTypes.flat().every((kind) => kind === 'string' || kind === 'empty')).toBe(true);
  await expect(toast(v)).toContainText('Izvoženih kontaktov: 2.');
  await expect(status(v)).toHaveText('Izbrana: 2');
  await expect(v.getByRole('alert')).toHaveCount(0);
  await expectNoAxeViolations(v);

  // Izvoz je branje: število vnosov revizijske sledi se ni spremenilo (FR-010-14).
  expect(auditEntryCount(id)).toBe(auditBefore);
  await viewer.context.close();
});

test('FR-010-05 FR-010-06 FR-010-08 FR-010-09: atributi po slovenski abecedi, značke in zaščita pred formulami', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createContactWithAttributes(
    id,
    'Ana Aaa',
    [
      ['kompetenca', 'web dev'],
      ['Oddelek', 'IT'],
    ],
    ['konferenca2025', 'Alumni', 'ne_obveščaj'],
  );
  createContactWithAttributes(id, 'Bor Bbb', [['podjetje', 'FERI']]);
  createSearchContact(id, {
    first: '=HYPERLINK("http://x","klik")',
    last: 'Ccc',
    phone: '+386 41 123 456',
  });

  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page, 'Projekt FERI')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Izberi vse na strani', exact: true }).check();
  await expect(status(page)).toHaveText('Izbrani: 3');

  const { file } = await exportAndRead(page);
  expect(file.rows).toEqual([
    [...HEADER_SL, 'kompetenca', 'Oddelek', 'podjetje', 'Značke'],
    ['Ana', 'Aaa', '', '', '', 'web dev', 'IT', '', 'Alumni, konferenca2025, ne_obveščaj'],
    ['Bor', 'Bbb', '', '', '', '', '', 'FERI', ''],
    ['\'=HYPERLINK("http://x","klik")', 'Ccc', '', '', "'+386 41 123 456", '', '', '', ''],
  ]);
  expect(file.hasFormula).toBe(false);
  expect(file.cellTypes.flat().every((kind) => kind === 'string' || kind === 'empty')).toBe(true);
});

test('FR-010-04 FR-010-10: angleški vmesnik – list Contacts, glava in ime datoteke', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchContact(id, { first: 'Ana', last: 'Kos', email: 'ana@kos.si' });
  const en = await otherUser(browser, page, 'Ana English', 'en-US');
  setRole(id, en.user.email, 'EDITOR');

  await en.page.goto(`/groups/${id}/contacts`);
  await en.page.getByRole('checkbox', { name: 'Select Ana Kos', exact: true }).check();
  const bar = en.page.getByRole('toolbar', { name: 'Selection actions' });
  const { name, file } = await exportAndRead(
    en.page,
    bar.getByRole('button', { name: 'Export to Excel' }),
  );
  expect(name).toBe(`Projekt-FERI-contacts-${localDate()}.xlsx`);
  expect(file.sheetNames).toEqual(['Contacts']);
  expect(file.rows).toEqual([
    ['First name', 'Last name', 'Address', 'Email', 'Phone', 'Tags'],
    ['Ana', 'Kos', '', 'ana@kos.si', '', ''],
  ]);
  await expect(en.page.getByRole('region', { name: 'Notifications' })).toContainText(
    'Contacts exported: 1.',
  );
  await en.context.close();
});

test('FR-010-07: razvrstitev po e-naslovu padajoče – vrstice v vrstnem redu seznama', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchContact(id, { first: 'Ana', last: 'Kos', email: 'a@x.si' });
  createSearchContact(id, { first: 'Bor', last: 'Zupan', email: 'c@x.si' });
  createSearchContact(id, { first: 'Cene', last: 'Čeh', email: 'b@x.si' });

  await page.goto(`/groups/${id}/contacts?sort=email&dir=desc`);
  await expect(rows(page, 'Projekt FERI')).toHaveCount(3);
  const listed = await rows(page, 'Projekt FERI').allInnerTexts();
  await page.getByRole('checkbox', { name: 'Izberi vse na strani', exact: true }).check();

  const { file } = await exportAndRead(page);
  const expected = ['Bor Zupan', 'Cene Čeh', 'Ana Kos'];
  expect(file.rows.slice(1).map((row) => row[3])).toEqual(['c@x.si', 'b@x.si', 'a@x.si']);
  expect(file.rows.slice(1).map((row) => `${row[0]} ${row[1]}`)).toEqual(expected);
  expected.forEach((label, index) => expect(listed[index]).toContain(label));
});

test('FR-010-02 FR-009-18: vsi zadetki – 12 vrstic, sprememba med izborom, *Nadaljuj z obstoječim izborom* da 12, *Posodobi izbor* in ponovni izvoz da 13', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createTaggedContacts(id, 12, 'konferenca2025');
  const thirteenth = createSearchContact(id, { first: 'Trinajsti', last: 'Kontakt' });

  await page.goto(`/groups/${id}/contacts?tag=konferenca2025`);
  await expect(rows(page, 'Projekt FERI')).toHaveCount(12);
  await pick(page, 'Ime001 Priimek001').check();
  await toolbar(page).getByRole('button', { name: 'Izberi vse zadetke (12)' }).click();
  await expect(status(page)).toHaveText('Izbranih: 12');

  const twelve = Array.from(
    { length: 12 },
    (_, i) => `Ime${String(i + 1).padStart(3, '0')} Priimek${String(i + 1).padStart(3, '0')}`,
  );
  const names = (rowsOfFile: string[][]) =>
    rowsOfFile
      .slice(1)
      .map((row) => `${row[0]} ${row[1]}`)
      .sort();

  const first = await exportAndRead(page);
  expect(first.file.rows).toHaveLength(13);
  expect(names(first.file.rows)).toEqual(twelve);

  // Drug uporabnik doda značko trinajstemu kontaktu.
  addTagInDb(thirteenth, 'konferenca2025');

  await exportButton(page).click();
  const notice = page.getByRole('alert');
  await expect(notice).toContainText('Izbor se je spremenil: 1 nov zadetek.');
  await expectNoAxeViolations(page);

  // *Nadaljuj z obstoječim izborom*: datoteka vsebuje prvotnih 12 kontaktov.
  const kept = await exportAndRead(
    page,
    notice.getByRole('button', { name: 'Nadaljuj z obstoječim izborom' }),
  );
  expect(kept.file.rows).toHaveLength(13);
  expect(names(kept.file.rows)).toEqual(twelve);

  // *Posodobi izbor*: izbor ima 13 kontaktov in izvoz vsebuje tudi trinajstega.
  await exportButton(page).click();
  await page.getByRole('alert').getByRole('button', { name: 'Posodobi izbor' }).click();
  await expect(status(page)).toHaveText('Izbranih: 13');
  const second = await exportAndRead(page);
  expect(second.file.rows).toHaveLength(14);
  expect(names(second.file.rows)).toEqual([...twelve, 'Trinajsti Kontakt'].sort());
});

test('FR-010-16 FR-010-14: arhivirana skupina – akcijska vrstica brez urejanja in izbrisa, izvoz uspe, sled nespremenjena', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchContact(id, { first: 'Ana', last: 'Kos', email: 'ana@kos.si' });
  createSearchContact(id, { first: 'Bor', last: 'Zupan' });
  archive(id);
  const auditBefore = auditEntryCount(id);

  await page.goto(`/groups/${id}/contacts`);
  await page.getByRole('checkbox', { name: 'Izberi vse na strani', exact: true }).check();
  const bar = toolbar(page);
  await expect(bar.getByRole('button', { name: 'Izvozi v Excel' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Uredi izbrane' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Izbriši' })).toHaveCount(0);

  const { name, file } = await exportAndRead(page);
  expect(name).toBe(`Projekt-FERI-kontakti-${localDate()}.xlsx`);
  expect(file.rows).toHaveLength(3);
  expect(file.rows[1]?.slice(0, 2)).toEqual(['Ana', 'Kos']);
  expect(auditEntryCount(id)).toBe(auditBefore);
});

test('FR-010-01 FR-010-15 SC-005: samo tipkovnica – gumb v akcijski vrstici, izvoz in obvestilo, brez vodoravnega drsenja', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createSearchContact(id, { first: 'Ana', last: 'Kos' });
  await page.goto(`/groups/${id}/contacts`);

  await pick(page, 'Ana Kos').focus();
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Izbran: 1');
  await expectNoAxeViolations(page);

  const button = exportButton(page);
  await expect(button).toBeVisible();
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 640) {
    // Pod 640 px je akcijska vrstica prilepljena na spodnji rob (design.md 8.8).
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box && box.y + box.height <= viewport.height).toBe(true);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await button.focus();
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`Projekt-FERI-kontakti-${localDate()}.xlsx`);
  await expect(toast(page)).toContainText('Izvoženih kontaktov: 1.');
  await expectNoAxeViolations(page);
});
