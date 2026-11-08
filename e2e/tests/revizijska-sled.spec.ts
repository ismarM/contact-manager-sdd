import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import {
  auditCount,
  contactRow,
  createContactViaApi,
  entryIdByAction,
  latestEntryId,
} from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import { archive, createGroup, setRole } from './support/groups';

// 005 revizijska sled (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px; panel podrobnosti
// kontakta je viden od 1280 px. Kontakte za sled ustvarjajo testi prek vmesnika ali API (SQL ne ustvari vnosov).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const hasPanel = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;

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

const details = (page: Page) =>
  hasPanel(page)
    ? page.getByRole('region', { name: 'Podrobnosti kontakta' })
    : page.getByRole('main');
const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const trail = (page: Page) => page.getByRole('list', { name: 'Vnosi revizijske sledi' });
const entries = (page: Page) => trail(page).getByRole('listitem');
const BUTTON = 'Povrni skupino na to točko';

async function openAudit(page: Page, groupId: string) {
  await page.goto(`/groups/${groupId}/audit`);
  await expect(page.getByRole('heading', { level: 2, name: 'Revizijska sled' })).toBeVisible();
}

/** Ustvari kontakt prek obrazca (FR-005-01). */
async function addContact(page: Page, groupId: string, first: string, last: string) {
  await page.goto(`/groups/${groupId}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill(first);
  await page.getByRole('textbox', { name: 'Priimek' }).fill(last);
  const tags = page.getByRole('combobox', { name: 'Dodaj značko' });
  await tags.fill('vip');
  await page.keyboard.press('Enter');
  await tags.fill('konferenca2025');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/contacts/[0-9a-f-]{36}$`));
  return /contacts\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? '';
}

async function editContact(page: Page, groupId: string, contactId: string) {
  await page.goto(`/groups/${groupId}/contacts/${contactId}/edit`);
  await page.getByRole('textbox', { name: 'Telefon' }).fill('040 111 222');
  await page.getByRole('button', { name: 'Dodaj atribut' }).click();
  await page.getByRole('textbox', { name: 'Ključ' }).fill('kompetenca');
  await page.getByRole('textbox', { name: 'Vrednost' }).fill('web dev');
  await page.getByRole('button', { name: 'Odstrani značko vip' }).click();
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Janez Novak je shranjen.');
}

async function deleteContact(page: Page, groupId: string, contactId: string) {
  await page.goto(`/groups/${groupId}/contacts/${contactId}`);
  await details(page).getByRole('button', { name: 'Izbriši kontakt' }).click();
  await page
    .getByRole('dialog', { name: 'Izbrišem kontakt Janez Novak?' })
    .getByRole('button', { name: 'Izbriši kontakt' })
    .click();
  await expect(toast(page)).toContainText('Kontakt Janez Novak je izbrisan.');
}

test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

test('FR-005-01 FR-005-02 FR-005-07 SC-001: urednik ustvari, uredi in izbriše kontakt – razdelek Revizijska sled pokaže tri vnose v pravilnem vrstnem redu', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const contactId = await addContact(page, groupId, 'Janez', 'Novak');
  await editContact(page, groupId, contactId);
  await deleteContact(page, groupId, contactId);

  await page.goto(`/groups/${groupId}/contacts`);
  await page
    .getByRole('navigation', { name: 'Razdelki skupine' })
    .getByRole('link', { name: 'Revizijska sled' })
    .click();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/audit$`));
  await expect(entries(page)).toHaveCount(3);
  await expect(entries(page).nth(0)).toContainText('izbrisal(a) kontakt Janez Novak');
  await expect(entries(page).nth(1)).toContainText('uredil(a) kontakt Janez Novak');
  await expect(entries(page).nth(2)).toContainText('dodal(a) kontakt Janez Novak');
  await expect(entries(page).nth(0)).toContainText('Ana Novak');
  expect(auditCount(groupId)).toBe(3);
  await expectNoAxeViolations(page);
});

test('FR-005-02 FR-005-08: Podrobnosti urejanja – razkritje kontakta pokaže preglednico s poljema Telefon, kompetenca in Značke', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const contactId = await addContact(page, groupId, 'Janez', 'Novak');
  await editContact(page, groupId, contactId);
  await openAudit(page, groupId);

  const edit = entries(page).nth(0);
  await edit.getByRole('group', { name: 'Podrobnosti' }).click();
  const affected = edit.getByRole('list', { name: 'Prizadeti kontakti' });
  await expect(edit.getByRole('table')).toHaveCount(0);
  await affected.getByRole('group', { name: 'Janez Novak' }).click();

  const table = edit.getByRole('table', { name: 'Spremembe kontakta Janez Novak' });
  await expect(table.getByRole('rowheader')).toHaveText(['Telefon', 'kompetenca', 'Značke']);
  await expect(table.getByRole('row', { name: /Značke/ })).toContainText('vip, konferenca2025');
  await expectNoAxeViolations(page);
});

test('FR-005-09 FR-005-10: filter odstranjevanje ostane po osvežitvi', async ({ page }) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const first = await addContact(page, groupId, 'Janez', 'Novak');
  await addContact(page, groupId, 'Ana', 'Prva');
  await deleteContact(page, groupId, first);
  await openAudit(page, groupId);
  await expect(entries(page)).toHaveCount(3);

  await page.getByRole('button', { name: 'Filtri' }).click();
  await page.getByRole('checkbox', { name: 'odstranjevanje' }).check();
  await page.getByRole('button', { name: 'Uporabi filtre' }).click();

  await expect(page).toHaveURL(/action=DELETE/);
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText('izbrisal(a)');
  await page.reload();
  await expect(entries(page)).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Odstrani filter Vrsta: odstranjevanje' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-005-09 SC-004: iz pogleda kontakta odpre povezava sled, filtrirano po kontaktu (dva koraka)', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const janez = await addContact(page, groupId, 'Janez', 'Novak');
  await addContact(page, groupId, 'Ana', 'Prva');
  await editContact(page, groupId, janez);
  await page.goto(`/groups/${groupId}/contacts/${janez}`);

  await details(page)
    .getByRole('link', { name: 'Spremembe tega kontakta v revizijski sledi' })
    .click();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/audit\\?contact=${janez}$`));
  await expect(entries(page)).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Odstrani filter Kontakt: Janez Novak' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-005-11 FR-005-12 FR-005-16 FR-005-19: admin povrne skupino na vnos dodajanja s tipkovnico – obvestilo, nov vnos, obnovljen kontakt z oznako Povrnjeno', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const janez = await addContact(page, groupId, 'Janez', 'Novak');
  const ana = await addContact(page, groupId, 'Ana', 'Prva');
  await deleteContact(page, groupId, janez);
  expect(contactRow(janez)).toBeNull();
  await openAudit(page, groupId);

  const target = entries(page).nth(2);
  await expect(target).toContainText('dodal(a) kontakt Janez Novak');
  await target.getByRole('button', { name: BUTTON }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /^Povrnem skupino na stanje / });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Povrni skupino' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(toast(page)).toContainText('Skupina je povrnjena na stanje');
  await expect(entries(page)).toHaveCount(4);
  await expect(entries(page).first()).toContainText('povrnil(a) skupino na stanje');
  expect(auditCount(groupId)).toBe(4);
  expect(contactRow(janez)?.lastName).toBe('Novak');
  expect(contactRow(ana)).toBeNull();
  expect(contactRow(janez)?.revertedEntryId).toBe(latestEntryId(groupId));

  await page.goto(`/groups/${groupId}/contacts/${janez}`);
  const marker = details(page).getByRole('group', { name: 'Povrnjeno' });
  await marker.click();
  await expect(marker.getByRole('link', { name: 'Odpri vnos povrnitve' })).toHaveAttribute(
    'href',
    new RegExp(`/groups/${groupId}/audit/[0-9a-f-]{36}$`),
  );
  await expectNoAxeViolations(page);
  await marker.getByRole('link', { name: 'Odpri vnos povrnitve' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Vnos revizijske sledi' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: BUTTON })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('FR-005-14: dva admina – drugi potrdi rollback po prvem in dobi opozorilo ter osvežen seznam', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  await createContactViaApi(page, groupId, { firstName: 'Janez', lastName: 'Novak' });
  await createContactViaApi(page, groupId, { firstName: 'Ana', lastName: 'Prva' });
  const second = await otherUser(browser, page, 'Bojan Drugi');
  setRole(groupId, second.user.email, 'ADMIN');
  await openAudit(page, groupId);
  await openAudit(second.page, groupId);
  await expect(entries(second.page)).toHaveCount(2);

  await entries(page).nth(1).getByRole('button', { name: BUTTON }).click();
  await page
    .getByRole('dialog', { name: /^Povrnem skupino na stanje / })
    .getByRole('button', { name: 'Povrni skupino' })
    .click();
  await expect(toast(page)).toContainText('Skupina je povrnjena na stanje');
  await entries(second.page).nth(1).getByRole('button', { name: BUTTON }).click();
  await second.page
    .getByRole('dialog', { name: /^Povrnem skupino na stanje / })
    .getByRole('button', { name: 'Povrni skupino' })
    .click();

  await expect(second.page.getByRole('alert')).toContainText(
    'Revizijska sled se je medtem spremenila.',
  );
  await expect(entries(second.page)).toHaveCount(3);
  await expectNoAxeViolations(second.page);
  expect(auditCount(groupId)).toBe(3);
  await second.context.close();
});

test('FR-005-13: urednik z odprtim obrazcem kontakta, ki ga rollback spremeni, ob shranjevanju dobi konflikt (004)', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const janez = await createContactViaApi(page, groupId, {
    firstName: 'Janez',
    lastName: 'Novak',
    phone: '01 111 111',
  });
  const editor = await otherUser(browser, page, 'Eva Urednik');
  setRole(groupId, editor.user.email, 'EDITOR');
  await page.goto(`/groups/${groupId}/contacts/${janez}/edit`);
  await page.getByRole('textbox', { name: 'Telefon' }).fill('040 999 888');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Janez Novak je shranjen.');
  await editor.page.goto(`/groups/${groupId}/contacts/${janez}/edit`);
  await editor.page.getByRole('textbox', { name: 'Telefon' }).fill('050 000 000');

  await openAudit(page, groupId);
  await entries(page).nth(1).getByRole('button', { name: BUTTON }).click();
  await page
    .getByRole('dialog', { name: /^Povrnem skupino na stanje / })
    .getByRole('button', { name: 'Povrni skupino' })
    .click();
  await expect(toast(page)).toContainText('Skupina je povrnjena na stanje');
  await editor.page.getByRole('button', { name: 'Shrani kontakt' }).click();

  await expect(editor.page.getByRole('alert').first()).toContainText(
    'Kontakt je medtem spremenil(a)',
  );
  await expectNoAxeViolations(editor.page);
  await editor.context.close();
});

test('FR-005-20: Začetno stanje na zadnji strani – rollback odstrani kontakte iz sledi', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const janez = await createContactViaApi(page, groupId, { firstName: 'Janez', lastName: 'Novak' });
  await createContactViaApi(page, groupId, { firstName: 'Ana', lastName: 'Prva' });
  await openAudit(page, groupId);

  const initial = entries(page).last();
  await expect(initial).toContainText('Začetno stanje');
  await expect(initial).toContainText('Stanje kontaktov pred prvim vnosom v revizijski sledi.');
  await expectNoAxeViolations(page);
  await initial.getByRole('button', { name: BUTTON }).click();
  const dialog = page.getByRole('dialog', { name: 'Povrnem skupino na začetno stanje?' });
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Povrni skupino' }).click();

  await expect(toast(page)).toContainText('Skupina je povrnjena na začetno stanje.');
  await expect(entries(page).first()).toContainText('povrnil(a) skupino na začetno stanje');
  expect(contactRow(janez)).toBeNull();
  expect(entryIdByAction(groupId, 'ROLLBACK')).toBeTruthy();
});

test('FR-005-17: bralec in arhivirana skupina – sled je berljiva, brez gumbov za rollback', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  await createContactViaApi(page, groupId, { firstName: 'Janez', lastName: 'Novak' });
  await createContactViaApi(page, groupId, { firstName: 'Ana', lastName: 'Prva' });
  const viewer = await otherUser(browser, page, 'Vid Bralec');
  setRole(groupId, viewer.user.email, 'VIEWER');

  await openAudit(viewer.page, groupId);
  await expect(entries(viewer.page)).toHaveCount(3);
  await expect(viewer.page.getByRole('button', { name: BUTTON })).toHaveCount(0);
  await expectNoAxeViolations(viewer.page);
  await viewer.context.close();

  archive(groupId);
  await openAudit(page, groupId);
  await expect(entries(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: BUTTON })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('FR-005-07 FR-005-16: angleški vmesnik – sled, čas in dialog rollbacka', async ({ page }) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  await createContactViaApi(page, groupId, { firstName: 'Janez', lastName: 'Novak' });
  await createContactViaApi(page, groupId, { firstName: 'Ana', lastName: 'Prva' });
  await page.goto('/account');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/me/preferences') && response.request().method() === 'PUT',
  );
  await page.getByRole('group', { name: 'Jezik' }).getByRole('radio', { name: 'English' }).check();
  expect((await saved).ok()).toBe(true);

  await page.goto(`/groups/${groupId}/audit`);

  await expect(page.getByRole('heading', { level: 2, name: 'Audit trail' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Audit trail entries' });
  await expect(list.getByRole('listitem').first()).toContainText('added contact Ana Prva');
  await expect(list.getByRole('listitem').first()).toContainText(
    /\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}/,
  );
  await list
    .getByRole('listitem')
    .nth(1)
    .getByRole('button', { name: 'Restore the group to this point' })
    .click();
  await expect(
    page.getByRole('dialog', { name: /^Restore the group to the state of / }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});
