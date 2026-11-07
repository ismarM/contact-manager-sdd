import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import {
  contactCount,
  contactExists,
  contactUpdatedAt,
  contactVersion,
  createContact,
  createContactsBulk,
  deleteContactInDb,
  setContactField,
} from './support/contacts';
import { archive, createGroup, setRole } from './support/groups';

// 004 kontakti (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px; panel podrobnosti je viden od
// 1280 px. Vloge in večje količine kontaktov pripravi SQL (D-27).

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

/** Čas spremembe v zapisu jezika, kot ga pokaže opozorilo o konfliktu (design.md 8.14: »… ob 14.32.«). */
const clock = (iso: string) =>
  new Intl.DateTimeFormat('sl', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/** Pogled kontakta: od 1280 px v panelu ob seznamu, sicer ločena stran (plan R-08). */
const details = (page: Page) =>
  hasPanel(page)
    ? page.getByRole('region', { name: 'Podrobnosti kontakta' })
    : page.getByRole('main');
const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const table = (page: Page, group = 'Projekt FERI') =>
  page.getByRole('table', { name: `Kontakti skupine ${group}` });

async function addContact(
  page: Page,
  groupId: string,
  fields: { first?: string; last?: string; email?: string; tags?: string[] },
) {
  await page.goto(`/groups/${groupId}/contacts/new`);
  if (fields.first)
    await page.getByRole('textbox', { name: 'Ime', exact: true }).fill(fields.first);
  if (fields.last) await page.getByRole('textbox', { name: 'Priimek' }).fill(fields.last);
  if (fields.email) await page.getByRole('textbox', { name: 'E-naslov' }).fill(fields.email);
  for (const tag of fields.tags ?? []) {
    await page.getByRole('combobox', { name: 'Dodaj značko' }).fill(tag);
    await page.keyboard.press('Enter');
  }
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  // Shranjevanje je končano, ko je odprt pogled novega kontakta (FR-004-01); šele nato sme test brati URL ali oditi.
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/contacts/[0-9a-f-]{36}$`));
}

// Brskalnik v istem časovnem pasu kot proces testa, da se čas v opozorilu o konfliktu ujema s `clock`.
test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

test('FR-004-01 FR-004-03 FR-004-08 FR-004-09 SC-001: urednik ustvari kontakt z atributom in značkama, pogled in seznam', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await expect(
    page.getByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Razdelki skupine' }).getByRole('link'),
  ).toHaveText(['Kontakti', 'Nastavitve']);
  await expectNoAxeViolations(page);

  await page.getByRole('main').getByRole('link', { name: 'Nov kontakt' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/new$`));
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Janez');
  await page.getByRole('textbox', { name: 'Priimek' }).fill('Novak');
  await page.getByRole('textbox', { name: 'E-naslov' }).fill('janez@primer.si');
  await page.getByRole('button', { name: 'Dodaj atribut' }).click();
  await page.getByRole('textbox', { name: 'Ključ' }).fill('kompetenca');
  await page.getByRole('textbox', { name: 'Vrednost' }).fill('web dev');
  const tags = page.getByRole('combobox', { name: 'Dodaj značko' });
  await tags.fill('ne_obveščaj');
  await page.keyboard.press('Enter');
  await tags.fill('konferenca2025');
  await page.keyboard.press('Enter');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  await expect(toast(page)).toContainText('Kontakt Janez Novak je shranjen.');
  await expect(page.getByRole('heading', { level: 2, name: 'Janez Novak' })).toBeVisible();
  await expect(details(page).getByRole('link', { name: 'janez@primer.si' })).toHaveAttribute(
    'href',
    'mailto:janez@primer.si',
  );
  await expect(page.getByRole('definition').filter({ hasText: 'web dev' })).toBeVisible();
  await expect(
    details(page).getByRole('listitem').filter({ hasText: 'konferenca2025' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto(`/groups/${id}/contacts`);
  await expect(table(page)).toContainText('Janez Novak');
  await expect(table(page)).toContainText('ne_obveščaj');
  await expectNoAxeViolations(page);
});

test('FR-004-06 FR-004-09 SC-005: 60 kontaktov – strani, velikost strani, panel ali ločena stran; osvežitev', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  createContactsBulk(id, 60);

  await page.goto(`/groups/${id}/contacts`);
  // Pod 640 px vsebnika je glava preglednice skrita (design.md 8.6), zato štejemo vrstice s podatki.
  await expect(table(page).getByRole('rowheader')).toHaveCount(25);
  const pagination = page.getByRole('navigation', { name: 'Strani rezultatov' });
  await expect(pagination.getByRole('status')).toHaveText('1–25 od 60');
  await expectNoAxeViolations(page);
  await pagination.getByRole('button', { name: 'Naslednja' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(pagination.getByRole('status')).toHaveText('26–50 od 60');
  await page.reload();
  await expect(pagination.getByRole('status')).toHaveText('26–50 od 60');

  await table(page).getByRole('link', { name: 'Ime030 Priimek030' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}`));
  if (hasPanel(page)) {
    await expect(page.getByRole('region', { name: 'Podrobnosti kontakta' })).toContainText(
      'Ime030 Priimek030',
    );
    await expect(table(page)).toBeVisible();
    await expectNoAxeViolations(page);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Podrobnosti kontakta' })).toContainText(
      'Ime030 Priimek030',
    );
  } else {
    await expect(page.getByRole('heading', { level: 2, name: 'Ime030 Priimek030' })).toBeVisible();
    await expect(table(page)).toHaveCount(0);
    await expectNoAxeViolations(page);
    await page.getByRole('link', { name: 'Nazaj na seznam kontaktov' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pagination.getByRole('status')).toHaveText('26–50 od 60');
    await expectNoAxeViolations(page);
  }
});

test('FR-004-10 FR-004-05: urednik uredi kontakt; neshranjene spremembe zahtevajo potrditev', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await addContact(page, id, { first: 'Janez', last: 'Novak', tags: ['stara', 'vip'] });
  await expect(page.getByRole('heading', { level: 2, name: 'Janez Novak' })).toBeVisible();

  await page.getByRole('link', { name: 'Uredi kontakt' }).click();
  await expect(page.getByRole('textbox', { name: 'Ime', exact: true })).toHaveValue('Janez');
  await page.getByRole('textbox', { name: 'Telefon' }).fill('040 111 222');
  await page.getByRole('button', { name: 'Prekliči' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zavržem spremembe?' });
  await expect(dialog.getByRole('button', { name: 'Nadaljuj z urejanjem' })).toBeFocused();
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Nadaljuj z urejanjem' }).click();
  await page.getByRole('button', { name: 'Odstrani značko stara' }).click();
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();

  await expect(toast(page)).toContainText('Kontakt Janez Novak je shranjen.');
  await expectNoAxeViolations(page);
  await expect(details(page).getByRole('link', { name: '040 111 222' })).toBeVisible();
  await expect(details(page).getByRole('listitem').filter({ hasText: 'stara' })).toHaveCount(0);
});

test('FR-004-11: konflikt – drugi urednik je medtem spremenil kontakt; razlike in Shrani moje spremembe', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await addContact(page, id, { first: 'Janez', last: 'Novak' });
  const url = page.url();
  const bojan = await otherUser(browser, page, 'Bojan Kovač');
  setRole(id, bojan.user.email, 'EDITOR');

  const contact = new URL(url).pathname.split('/').at(-1) ?? '';

  // Anin obrazec je naložen z verzijo pred Bojanovo spremembo.
  await page.goto(`${url}/edit`);
  await expect(page.getByRole('textbox', { name: 'Ime', exact: true })).toHaveValue('Janez');
  await bojan.page.goto(`${url}/edit`);
  await expect(bojan.page.getByRole('textbox', { name: 'Ime', exact: true })).toHaveValue('Janez');
  await expectNoAxeViolations(bojan.page);
  await bojan.page.getByRole('textbox', { name: 'Telefon' }).fill('031 999 888');
  await bojan.page.getByRole('button', { name: 'Shrani kontakt' }).click();
  await expect(toast(bojan.page)).toContainText('shranjen');

  await page.getByRole('textbox', { name: 'Telefon' }).fill('01 234 5678');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(
    `Kontakt je medtem spremenil(a) Bojan Kovač ob ${clock(contactUpdatedAt(contact))}.`,
  );
  await alert.getByRole('button', { name: 'Prikaži razlike' }).click();
  const diff = page.getByRole('table', { name: 'Razlike med tvojimi in trenutnimi vrednostmi' });
  await expect(diff).toContainText('01 234 5678');
  await expect(diff).toContainText('031 999 888');
  await expectNoAxeViolations(page);
  await alert.getByRole('button', { name: 'Shrani moje spremembe' }).click();

  await expect(toast(page)).toContainText('Kontakt Janez Novak je shranjen.');
  await expect(details(page).getByRole('link', { name: '01 234 5678' })).toBeVisible();
  await expectNoAxeViolations(page);
  await bojan.context.close();
});

test('FR-004-12: izbris iz pogleda in vrstice – dialog, fokus, obvestilo, kontakta ni več v seznamu', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await addContact(page, id, { first: 'Janez', last: 'Novak' });
  await addContact(page, id, { first: 'Metka', last: 'Zupan' });

  await page.goto(`/groups/${id}/contacts`);
  await table(page).getByRole('button', { name: 'Dejanja za Metka Zupan' }).click();
  await page.getByRole('menuitem', { name: 'Izbriši kontakt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Izbrišem kontakt Metka Zupan?' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Izbriši kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt Metka Zupan je izbrisan.');
  // Pozitiven znak osveženega seznama, preden preverimo, da izbrisanega kontakta ni.
  await expect(table(page).getByRole('link', { name: 'Janez Novak' })).toBeVisible();
  await expect(table(page)).not.toContainText('Metka Zupan');
  expect(contactCount(id)).toBe(1);

  await table(page).getByRole('link', { name: 'Janez Novak' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  await expect(page.getByRole('button', { name: 'Izbriši kontakt' }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Izbriši kontakt' }).first().click();
  await page
    .getByRole('dialog', { name: 'Izbrišem kontakt Janez Novak?' })
    .getByRole('button', { name: 'Izbriši kontakt' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts$`));
  await expect(
    page.getByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  expect(contactCount(id)).toBe(0);
});

test('FR-004-13: kontakt, ki ga je medtem izbrisal drug član – izbris iz vrstice in pogleda, shranjevanje v obrazcu', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const metka = createContact(id, { first: 'Metka', last: 'Zupan' });
  const janez = createContact(id, { first: 'Janez', last: 'Novak' });
  const gone = 'Tega kontakta ni več – medtem ga je nekdo izbrisal.';

  // Izbris iz menija vrstice: seznam je naložen, nato kontakt izbriše nekdo drug.
  await page.goto(`/groups/${id}/contacts`);
  await expect(table(page)).toContainText('Metka Zupan');
  deleteContactInDb(metka);
  await table(page).getByRole('button', { name: 'Dejanja za Metka Zupan' }).click();
  await page.getByRole('menuitem', { name: 'Izbriši kontakt' }).click();
  await page
    .getByRole('dialog', { name: 'Izbrišem kontakt Metka Zupan?' })
    .getByRole('button', { name: 'Izbriši kontakt' })
    .click();
  await expect(page.getByRole('alert')).toContainText(gone);
  await expect(table(page).getByRole('link', { name: 'Janez Novak' })).toBeVisible();
  await expect(table(page)).not.toContainText('Metka Zupan');
  await expectNoAxeViolations(page);

  // Shranjevanje v obrazcu: obrazec ostane z vnesenimi podatki in povezavo na seznam; kontakt se ne ustvari znova.
  await page.goto(`/groups/${id}/contacts/${janez}/edit`);
  await expect(page.getByRole('textbox', { name: 'Ime', exact: true })).toHaveValue('Janez');
  deleteContactInDb(janez);
  await page.getByRole('textbox', { name: 'Telefon' }).fill('040 111 222');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(gone);
  await expect(page.getByRole('textbox', { name: 'Telefon' })).toHaveValue('040 111 222');
  await expect(page.getByRole('textbox', { name: 'Ime', exact: true })).toHaveValue('Janez');
  await expectNoAxeViolations(page);
  expect(contactExists(janez)).toBe(false);
  expect(contactCount(id)).toBe(0);
  // Neshranjena sprememba ostane v obrazcu, zato varovalo velja tudi po 404 (FR-004-05).
  await alert.getByRole('link', { name: 'Nazaj na seznam kontaktov' }).click();
  const discard = page.getByRole('dialog', { name: 'Zavržem spremembe?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Zavrzi spremembe' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts$`));

  // Izbris iz pogleda: pogled je odprt, nato kontakt izbriše nekdo drug.
  const ana = createContact(id, { first: 'Ana', last: 'Kralj' });
  await page.goto(`/groups/${id}/contacts/${ana}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Ana Kralj' })).toBeVisible();
  await expectNoAxeViolations(page);
  deleteContactInDb(ana);
  await page.getByRole('button', { name: 'Izbriši kontakt' }).first().click();
  await page
    .getByRole('dialog', { name: 'Izbrišem kontakt Ana Kralj?' })
    .getByRole('button', { name: 'Izbriši kontakt' })
    .click();
  await expect(page.getByRole('alert')).toContainText(gone);
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts$`));
  await expect(
    page.getByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-004-07 FR-004-15 FR-004-17: bralec in arhivirana skupina nimata akcij; obrazec ni dosegljiv', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await addContact(page, id, { first: 'Janez', last: 'Novak' });
  const eva = await otherUser(browser, page, 'Eva Kralj');
  setRole(id, eva.user.email, 'VIEWER');

  await eva.page.goto(`/groups/${id}/contacts`);
  await expect(table(eva.page)).toContainText('Janez Novak');
  await expect(eva.page.getByRole('link', { name: 'Nov kontakt' })).toHaveCount(0);
  await expect(eva.page.getByRole('button', { name: /^Dejanja za/ })).toHaveCount(0);
  await expectNoAxeViolations(eva.page);
  await eva.page.goto(`/groups/${id}/contacts/new`);
  await expect(eva.page.getByRole('main')).toContainText(
    'Za urejanje kontaktov potrebuješ vlogo urednik ali višjo.',
  );
  await expect(eva.page.getByRole('textbox')).toHaveCount(0);
  await expectNoAxeViolations(eva.page);
  await eva.context.close();

  archive(id);
  await page.goto(`/groups/${id}/contacts`);
  await expect(table(page)).toContainText('Janez Novak');
  await expect(page.getByRole('link', { name: 'Nov kontakt' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.goto(`/groups/${id}/contacts/new`);
  await expect(page.getByRole('main')).toContainText(
    'Skupina je arhivirana – kontaktov ni mogoče spreminjati.',
  );
  await expectNoAxeViolations(page);
});

test('FR-004-14: kontakt druge skupine pod to skupino je »Te strani ni« in ne razkrije podatkov', async ({
  page,
}) => {
  await signedIn(page);
  const a = await createGroup(page, { title: 'Skupina A' });
  await addContact(page, a, { first: 'Janez', last: 'Novak' });
  const contactUrl = new URL(page.url()).pathname;
  const contact = contactUrl.split('/').at(-1) ?? '';
  const b = await createGroup(page, { title: 'Skupina B' });

  await page.goto(`/groups/${b}/contacts/${contact}`);

  if (hasPanel(page)) {
    await expect(page.getByRole('region', { name: 'Podrobnosti kontakta' })).toContainText(
      'Tega kontakta ni več',
    );
  } else {
    await expect(page.getByRole('heading', { level: 1, name: 'Te strani ni' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Janez Novak' })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('FR-004-02 FR-004-03: validacija – povzetek napak, napaka ob zapustitvi polja, nič se ne shrani', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/contacts/new`);

  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  const summary = page.getByRole('alert');
  await expect(summary).toContainText('Obrazec vsebuje napake.');
  await expect(summary).toBeFocused();
  await expect(
    summary.getByRole('link', { name: 'Vpiši vsaj ime ali priimek.' }).first(),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await summary.getByRole('link', { name: 'Vpiši vsaj ime ali priimek.' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Ime', exact: true })).toBeFocused();

  const email = page.getByRole('textbox', { name: 'E-naslov' });
  await email.fill('janez@');
  await email.blur();
  await expect(email).toHaveAccessibleDescription('Vpiši veljaven e-naslov.');
  await expectNoAxeViolations(page);
  expect(contactCount(id)).toBe(0);
});

test('FR-004-04: predlogi značk so samo iz iste skupine', async ({ page }) => {
  await signedIn(page);
  const a = await createGroup(page, { title: 'Skupina A' });
  createContact(a, { first: 'Janez', last: 'Novak', tags: ['skrivnost-a'] });
  const b = await createGroup(page, { title: 'Skupina B' });
  createContact(b, { first: 'Metka', last: 'Zupan', tags: ['skupna-b'] });

  await page.goto(`/groups/${b}/contacts/new`);
  const combobox = page.getByRole('combobox', { name: 'Dodaj značko' });
  await combobox.fill('s');

  await expect(page.getByRole('option', { name: 'skupna-b' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'skrivnost-a' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Odstrani značko skupna-b' })).toBeVisible();
});

test('FR-004-11 SC-004: konflikt – Uporabi trenutno različico naloži vrednosti drugega urednika', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const contact = createContact(id, { first: 'Janez', last: 'Novak' });
  await page.goto(`/groups/${id}/contacts/${contact}/edit`);
  await expect(page.getByRole('textbox', { name: 'Ime', exact: true })).toHaveValue('Janez');
  setContactField(contact, 'phone', '031 999 888');
  await page.getByRole('textbox', { name: 'Priimek' }).fill('Horvat');
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();

  const alert = page.getByRole('alert');
  // Kontakt iz SQL nima izvajalca spremembe (updated_by NULL) – feature-map §2.5.
  await expect(alert).toContainText(
    `Kontakt je medtem spremenil(a) izbrisan uporabnik ob ${clock(contactUpdatedAt(contact))}.`,
  );
  await alert.getByRole('button', { name: 'Uporabi trenutno različico' }).click();

  await expect(page.getByRole('textbox', { name: 'Priimek' })).toHaveValue('Novak');
  await expect(page.getByRole('textbox', { name: 'Telefon' })).toHaveValue('031 999 888');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('FR-004-12: izbris zastarele verzije – 409, kontakt ni izbrisan, ponovna potrditev uspe', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const contact = createContact(id, { first: 'Janez', last: 'Novak' });
  await page.goto(`/groups/${id}/contacts/${contact}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Janez Novak' })).toBeVisible();
  setContactField(contact, 'phone', '031 999 888');

  await page.getByRole('button', { name: 'Izbriši kontakt' }).first().click();
  await page
    .getByRole('dialog', { name: 'Izbrišem kontakt Janez Novak?' })
    .getByRole('button', { name: 'Izbriši kontakt' })
    .click();

  await expect(page.getByRole('alert')).toContainText(
    `Kontakt je medtem spremenil(a) izbrisan uporabnik ob ${clock(contactUpdatedAt(contact))}.`,
  );
  expect(contactExists(contact)).toBe(true);
  expect(contactVersion(contact)).toBe(1);
  await expect(details(page).getByRole('link', { name: '031 999 888' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Izbriši kontakt' }).first().click();
  await page
    .getByRole('dialog', { name: 'Izbrišem kontakt Janez Novak?' })
    .getByRole('button', { name: 'Izbriši kontakt' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts$`));
  expect(contactExists(contact)).toBe(false);
});

test('FR-004-16: brez povezave – trajno sporočilo, obrazec ostane, Poskusi znova po vrnitvi povezave', async ({
  page,
  context,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/contacts/new`);
  await page.getByRole('textbox', { name: 'Ime', exact: true }).fill('Janez');

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Shrani kontakt' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Ni povezave. Preveri povezavo in poskusi znova.');
  await expect(page.getByRole('textbox', { name: 'Ime', exact: true })).toHaveValue('Janez');
  await expectNoAxeViolations(page);
  await context.setOffline(false);
  await alert.getByRole('button', { name: 'Poskusi znova' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  await expect(details(page).getByRole('heading', { level: 2, name: 'Janez' })).toBeVisible();
  await expectNoAxeViolations(page);
  expect(contactCount(id)).toBe(1);
});

/** Pritiska Tab, dokler fokus ni na elementu (največ 15 pritiskov); vse ostalo ostane samo s tipkovnico. */
async function tabTo(page: Page, target: ReturnType<Page['getByRole']>) {
  for (let i = 0; i < 15; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('FR-004-01 FR-004-04 SC-001 SC-006: angleški vmesnik – kontakt z dvema atributoma in dvema značkama samo s tipkovnico v manj kot 90 s', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto('/account');
  // Jezik se shrani v profil na strežniku; ponovno nalaganje počaka na odgovor, da ni dirke s profilom.
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/me/preferences') && response.request().method() === 'PUT',
  );
  await page.getByRole('group', { name: 'Jezik' }).getByRole('radio', { name: 'English' }).check();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  await page.goto(`/groups/${id}/contacts/new`);
  await expect(page.getByRole('heading', { level: 2, name: 'New contact' })).toBeVisible();

  const started = Date.now();
  await tabTo(page, page.getByRole('textbox', { name: 'First name' }));
  await page.keyboard.type('Janez');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Novak');
  await tabTo(page, page.getByRole('textbox', { name: 'Email' }));
  await page.keyboard.type('janez@primer.si');
  for (const [key, value] of [
    ['kompetenca', 'web dev'],
    ['oddelek', 'IT'],
  ] as const) {
    await tabTo(page, page.getByRole('button', { name: 'Add attribute' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Key' }).last()).toBeFocused();
    await page.keyboard.type(key);
    await page.keyboard.press('Tab');
    await page.keyboard.type(value);
  }
  await tabTo(page, page.getByRole('combobox', { name: 'Add tag' }));
  await page.keyboard.type('vip');
  await page.keyboard.press('Enter');
  await page.keyboard.type('konferenca2025');
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Save contact' }));
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/groups/${id}/contacts/[0-9a-f-]{36}$`));
  expect(Date.now() - started).toBeLessThan(90_000);
  await expect(page.getByRole('heading', { level: 2, name: 'Janez Novak' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit contact' })).toBeVisible();
  const english = hasPanel(page)
    ? page.getByRole('region', { name: 'Contact details' })
    : page.getByRole('main');
  await expect(english.getByRole('listitem').filter({ hasText: 'konferenca2025' })).toBeVisible();
  await expectNoAxeViolations(page);
});
