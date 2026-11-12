import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';

import { auditEntryCount, lastAuditEntry } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import {
  addTagInDb,
  attributesOf,
  contactCount,
  createContact,
  createContactWithTags,
  createTaggedContacts,
  removeTagInDb,
  tagsOf,
} from './support/contacts';
import { archive, createGroup, setRole, sql } from './support/groups';

// Priprava podatkov (SQL prek Dockerja), več uporabnikov in axe nad dialogi pod obremenitvijo `verify.sh full` presežejo
// privzetih 30 s (D-79).
test.describe.configure({ timeout: 90_000 });

// 009 izbor in množično urejanje kontaktov (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px.
// Podatke pripravi SQL (D-27); izbris, ki mora pustiti sled (R-02), naredi drug član prek vmesnika.

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

/** Drug član v ločenem kontekstu brskalnika (kot revizijska-sled.spec.ts). */
async function otherUser(browser: Browser, page: Page, name: string) {
  const context = await browser.newContext({
    locale: 'sl-SI',
    viewport: page.viewportSize() ?? undefined,
  });
  const other = await context.newPage();
  const user = await signedIn(other, name);
  return { context, page: other, user };
}

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Dejanja izbora' });
const status = (page: Page) => toolbar(page).getByRole('status');
const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const pick = (page: Page, label: string) =>
  page.getByRole('checkbox', { name: `Izberi ${label}`, exact: true });
const selectAll = (page: Page) =>
  page.getByRole('checkbox', { name: 'Izberi vse na strani', exact: true });
const rows = (page: Page, group: string) =>
  page.getByRole('table', { name: `Kontakti skupine ${group}` }).getByRole('rowheader');
const pagination = (page: Page) => page.getByRole('navigation', { name: 'Strani rezultatov' });

/** Ime kontakta, ki ga ustvari `createTaggedContacts` (n od 1). */
const name = (n: number) => `Ime${String(n).padStart(3, '0')} Priimek${String(n).padStart(3, '0')}`;

/** Doda značko v polje *Dodaj značke* dialoga urejanja. */
async function addTagInDialog(dialog: Locator, tag: string) {
  const input = dialog.getByRole('combobox', { name: 'Dodaj značke' });
  await input.fill(tag);
  await input.press('Enter');
}

test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

test('FR-009-01 FR-009-02 FR-009-05: izbor čez strani, filter in razvrstitev ohrani – »Izbranih: 5«, sl in en', async ({
  page,
  browser,
}) => {
  const user = await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createTaggedContacts(id, 60, 'konferenca2025');

  await page.goto(`/groups/${id}/contacts`);
  await expect(rows(page, 'Projekt FERI')).toHaveCount(25);
  await expect(toolbar(page)).toHaveCount(0);
  await expectNoAxeViolations(page);

  await pick(page, name(1)).check();
  await expect(toolbar(page)).toBeVisible();
  await expect(status(page)).toHaveText('Izbran: 1');
  await pick(page, name(2)).check();
  await expect(status(page)).toHaveText('Izbrana: 2');
  await pick(page, name(3)).check();
  await expect(status(page)).toHaveText('Izbrani: 3');
  await expectNoAxeViolations(page);

  await pagination(page).getByRole('button', { name: 'Naslednja' }).click();
  await expect(pagination(page).getByRole('status')).toHaveText('26–50 od 60');
  await pick(page, name(26)).check();
  await pick(page, name(27)).check();
  await expect(status(page)).toHaveText('Izbranih: 5');

  // Filter po znački (panel *Filtri*, tipkovnica kot v 008) in razvrstitev; izbor ostane.
  const area = page.getByRole('search', { name: 'Iskanje in filtri' });
  await area.getByRole('button', { name: 'Filtri', exact: true }).click();
  const panel = page.getByRole('group', { name: 'Filtri kontaktov' });
  await panel
    .getByRole('group', { name: 'Značke' })
    .getByRole('checkbox', { name: 'konferenca2025' })
    .focus();
  await page.keyboard.press('Space');
  await panel.getByRole('button', { name: 'Uporabi filtre' }).focus();
  await page.keyboard.press('Enter');
  await area.getByRole('combobox', { name: 'Razvrsti' }).selectOption('Priimek');
  await expect(status(page)).toHaveText('Izbranih: 5');

  // Angleški vmesnik: isto število v angleški obliki.
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: page.viewportSize() ?? undefined,
  });
  const en = await context.newPage();
  await en.goto('/');
  await signIn(en, user);
  await expect(en.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await en.goto(`/groups/${id}/contacts`);
  const enStatus = en.getByRole('toolbar', { name: 'Selection actions' }).getByRole('status');
  await en.getByRole('checkbox', { name: `Select ${name(1)}`, exact: true }).check();
  await expect(enStatus).toHaveText('1 selected');
  await en.getByRole('checkbox', { name: `Select ${name(2)}`, exact: true }).check();
  await expect(enStatus).toHaveText('2 selected');
  await expectNoAxeViolations(en);
  await context.close();
});

test('FR-009-02 FR-009-05: »Počisti izbor« – akcijska vrstica izgine, povezava »Nov kontakt« se vrne', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createTaggedContacts(id, 30, 'konferenca2025');
  await page.goto(`/groups/${id}/contacts`);

  await expect(page.getByRole('link', { name: 'Nov kontakt' })).toBeVisible();
  await selectAll(page).check();
  await expect(status(page)).toHaveText('Izbranih: 25');
  await expect(page.getByRole('link', { name: 'Nov kontakt' })).toHaveCount(0);
  await toolbar(page).getByRole('button', { name: 'Počisti izbor' }).click();
  await expect(toolbar(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nov kontakt' })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-009-03 FR-009-06 FR-009-12 FR-009-14 SC-001: »Izberi vse zadetke (300)« in dodajanje značke vsem v manj kot 30 s', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Konferenca 2025' });
  const ids = createTaggedContacts(id, 300, 'konferenca2025');
  await page.goto(`/groups/${id}/contacts?tag=konferenca2025`);
  await expect(rows(page, 'Konferenca 2025')).toHaveCount(25);
  const auditBefore = auditEntryCount(id);

  const started = Date.now();
  await pick(page, name(1)).check();
  await toolbar(page).getByRole('button', { name: 'Izberi vse zadetke (300)' }).click();
  await expect(status(page)).toHaveText('Izbranih: 300');
  await expectNoAxeViolations(page);

  await toolbar(page).getByRole('button', { name: 'Uredi izbrane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uredi izbrane kontakte (300)' });
  await expect(dialog).toBeVisible();
  await addTagInDialog(dialog, 'nova');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Uporabi za 300 kontaktov' }).click();
  await expect(toast(page)).toContainText('Posodobljenih 300 kontaktov.');
  expect(Date.now() - started).toBeLessThan(30_000);

  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText('Izbranih: 300');
  expect(
    sql(
      `select count(*) from contact_tag where tag_norm = 'nova'
       and contact_id in (select id from contact where group_id = '${id}'::uuid)`,
    ),
  ).toBe('300');
  expect(tagsOf(ids[0] ?? '')).toEqual(['konferenca2025', 'nova']);
  expect(auditEntryCount(id)).toBe(auditBefore + 1);
  expect(lastAuditEntry(id)).toEqual({ action: 'UPDATE', contactCount: 300 });
});

test('FR-009-07 FR-009-12: nastavitev dodatnega atributa vsem izbranim', async ({ page }) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const ids = createTaggedContacts(id, 3, 'konferenca2025');
  await page.goto(`/groups/${id}/contacts`);

  await selectAll(page).check();
  await toolbar(page).getByRole('button', { name: 'Uredi izbrane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uredi izbrane kontakte (3)' });
  await dialog.getByRole('button', { name: 'Dodaj atribut' }).click();
  await dialog.getByRole('combobox', { name: 'Atribut 1' }).selectOption('Dodatni atribut');
  await dialog.getByRole('textbox', { name: 'Ključ 1' }).fill('podjetje');
  await dialog.getByRole('textbox', { name: 'Vrednost 1' }).fill('FERI');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Uporabi za 3 kontakte' }).click();
  await expect(toast(page)).toContainText('Posodobljeni 3 kontakti.');
  for (const contact of ids) expect(attributesOf(contact)).toEqual([['podjetje', 'FERI']]);
});

test('FR-009-09 FR-009-17: kontakt z 30 značkami zavrne celotno operacijo – napaka z imenom, nič spremenjeno', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const ids = createTaggedContacts(id, 3, 'konferenca2025');
  const tags = Array.from({ length: 30 }, (_, i) => `znacka${i + 1}`);
  const mojca = createContactWithTags(id, 'Mojca Kralj', tags);
  await page.goto(`/groups/${id}/contacts`);
  const auditBefore = auditEntryCount(id);

  await selectAll(page).check();
  await expect(status(page)).toHaveText('Izbrani: 4');
  await toolbar(page).getByRole('button', { name: 'Uredi izbrane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uredi izbrane kontakte (4)' });
  await addTagInDialog(dialog, 'nova');
  await dialog.getByRole('button', { name: 'Uporabi za 4 kontakte' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Mojca Kralj');
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);

  expect(tagsOf(mojca)).toEqual(tags);
  for (const contact of ids) expect(tagsOf(contact)).toEqual(['konferenca2025']);
  expect(auditEntryCount(id)).toBe(auditBefore);
});

test('FR-009-10 FR-009-18: sprememba izbora med delom – obvestilo, *Posodobi izbor* ohrani vnose in dialog', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const ids = createTaggedContacts(id, 12, 'rezervacija');
  const extra = [1, 2, 3, 4].map((n) =>
    createContact(id, { first: 'Dodatni', last: `Kontakt${n}` }),
  );
  const eva = await otherUser(browser, page, 'Eva Urednik');
  setRole(id, eva.user.email, 'EDITOR');

  await page.goto(`/groups/${id}/contacts?tag=rezervacija`);
  await expect(rows(page, 'Projekt FERI')).toHaveCount(12);
  await pick(page, name(12)).check();
  await toolbar(page).getByRole('button', { name: 'Izberi vse zadetke (12)' }).click();
  await expect(status(page)).toHaveText('Izbranih: 12');
  await toolbar(page).getByRole('button', { name: 'Uredi izbrane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uredi izbrane kontakte (12)' });
  await addTagInDialog(dialog, 'nova');

  // Drug urednik: izbriše enega (prek vmesnika, da nastane sled), enemu odstrani značko, dvema neizbranima jo doda.
  await eva.page.goto(`/groups/${id}/contacts/${ids[0]}`);
  await eva.page.getByRole('button', { name: 'Izbriši kontakt' }).click();
  await eva.page
    .getByRole('dialog', { name: /^Izbrišem kontakt/ })
    .getByRole('button', { name: 'Izbriši kontakt' })
    .click();
  await expect(toast(eva.page)).toContainText('je izbrisan.');
  removeTagInDb(ids[1] ?? '', 'rezervacija');
  addTagInDb(extra[0] ?? '', 'rezervacija');
  addTagInDb(extra[1] ?? '', 'rezervacija');
  await eva.context.close();

  await dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Izbor se je spremenil: 2 nova zadetka, 1 kontakt ne ustreza več filtrom, 1 kontakt ne obstaja več.',
  );
  await expectNoAxeViolations(page);
  await expect(
    dialog.getByRole('checkbox', { name: 'Odstrani tudi kontakte, ki ne ustrezajo več filtrom' }),
  ).toBeChecked();
  await dialog.getByRole('button', { name: 'Posodobi izbor' }).click();
  await expect(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Dodaj značke' })).toBeVisible();
  expect(tagsOf(ids[2] ?? '')).toEqual(['rezervacija']);
});

test('FR-009-01 FR-009-05 SC-005: samo tipkovnica od izbora do obvestila; pri 320 px je akcijska vrstica na dnu brez vodoravnega drsenja', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createTaggedContacts(id, 40, 'konferenca2025');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/groups/${id}/contacts`);

  await pick(page, name(1)).focus();
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Izbran: 1');
  await expect(selectAll(page)).toBeVisible();
  await expectNoAxeViolations(page);

  const bar = toolbar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(640 - 4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // T057: vrstica ostane ob dnu vidnega polja tudi po drsenju seznama (ne drsi s stranjo).
  await page.evaluate(() => window.scrollTo(0, 0));
  const top = await bar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bottom = await bar.boundingBox();
  expect(top?.y).toBeCloseTo(bottom?.y ?? -1, 0);
  expect((bottom?.y ?? 0) + (bottom?.height ?? 0)).toBeGreaterThan(640 - 4);

  await bar.getByRole('button', { name: 'Uredi izbrane' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Uredi izbrane kontakte (1)' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Dodaj značke' }).focus();
  await page.keyboard.type('nova');
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Uporabi za 1 kontakt' }).focus();
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText('Posodobljen 1 kontakt.');
});

test('FR-009-13 FR-009-14: množični izbris 3 kontaktov – fokus na *Prekliči*, Esc ne izbriše, sled z enim vnosom za izbris in enim za urejanje', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Konferenca 2025' });
  createTaggedContacts(id, 300, 'konferenca2025');
  await page.goto(`/groups/${id}/contacts?tag=konferenca2025`);

  // Najprej množično urejanje vseh 300 (vnos »uredil(a) 300 kontaktov«).
  await pick(page, name(1)).check();
  await toolbar(page).getByRole('button', { name: 'Izberi vse zadetke (300)' }).click();
  await toolbar(page).getByRole('button', { name: 'Uredi izbrane' }).click();
  const edit = page.getByRole('dialog', { name: 'Uredi izbrane kontakte (300)' });
  await addTagInDialog(edit, 'nova');
  await edit.getByRole('button', { name: 'Uporabi za 300 kontaktov' }).click();
  await expect(toast(page)).toContainText('Posodobljenih 300 kontaktov.');
  await toolbar(page).getByRole('button', { name: 'Počisti izbor' }).click();

  // Izbris 3 kontaktov.
  for (const n of [1, 2, 3]) await pick(page, name(n)).check();
  await expect(status(page)).toHaveText('Izbrani: 3');
  const remove = toolbar(page).getByRole('button', { name: 'Izbriši', exact: true });
  await remove.click();
  const confirm = page.getByRole('alertdialog', { name: 'Izbrišem 3 kontakte?' });
  await expect(confirm).toContainText(
    'Kontakti bodo odstranjeni iz skupine Konferenca 2025. Izbris bo zabeležen v revizijski sledi.',
  );
  await expect(confirm.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  expect(contactCount(id)).toBe(300);
  await expect(remove).toBeFocused();

  await remove.click();
  await page
    .getByRole('alertdialog', { name: 'Izbrišem 3 kontakte?' })
    .getByRole('button', { name: 'Izbriši 3 kontakte' })
    .click();
  await expect(toast(page)).toContainText('Izbrisani 3 kontakti.');
  await expect(toolbar(page)).toHaveCount(0);
  expect(contactCount(id)).toBe(297);
  expect(lastAuditEntry(id)).toEqual({ action: 'DELETE', contactCount: 3 });

  await page.goto(`/groups/${id}/audit`);
  const entries = page.getByRole('list', { name: 'Vnosi revizijske sledi' }).getByRole('listitem');
  await expect(entries.filter({ hasText: 'izbrisal(a) 3 kontakte' })).toHaveCount(1);
  await expect(entries.filter({ hasText: 'uredil(a) 300 kontaktov' })).toHaveCount(1);
  await expectNoAxeViolations(page);
});

test('FR-009-05 FR-009-15: bralec ima akcijsko vrstico brez *Uredi izbrane* in *Izbriši*', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createTaggedContacts(id, 5, 'konferenca2025');
  const bralec = await otherUser(browser, page, 'Bor Bralec');
  setRole(id, bralec.user.email, 'VIEWER');

  await bralec.page.goto(`/groups/${id}/contacts`);
  await pick(bralec.page, name(1)).check();
  const bar = toolbar(bralec.page);
  await expect(status(bralec.page)).toHaveText('Izbran: 1');
  await expect(bar.getByRole('button', { name: 'Izberi vse zadetke (5)' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Počisti izbor' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Uredi izbrane' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Izbriši', exact: true })).toHaveCount(0);
  await expectNoAxeViolations(bralec.page);
  await bralec.context.close();
});

test('FR-009-05 FR-009-15: v arhivirani skupini urednik izbira, akcij pisanja pa ni', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Lastnik Skupine');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createTaggedContacts(id, 5, 'konferenca2025');
  const eva = await otherUser(browser, page, 'Eva Urednik');
  setRole(id, eva.user.email, 'EDITOR');
  archive(id);

  await eva.page.goto(`/groups/${id}/contacts`);
  await pick(eva.page, name(1)).check();
  await pick(eva.page, name(2)).check();
  const bar = toolbar(eva.page);
  await expect(status(eva.page)).toHaveText('Izbrana: 2');
  await expect(bar.getByRole('button', { name: 'Izberi vse zadetke (5)' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Uredi izbrane' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Izbriši', exact: true })).toHaveCount(0);
  await expectNoAxeViolations(eva.page);
  await eva.context.close();
});
