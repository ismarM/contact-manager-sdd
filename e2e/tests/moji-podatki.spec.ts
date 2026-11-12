import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { createContactViaApi } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import { archive, createGroup, groupExists, memberCount, setRole } from './support/groups';
import { invitationExists } from './support/invitations';
import { addMember } from './support/members';
import {
  addReceivedInvitation,
  addSentInvitation,
  failExport,
  fakeDeletion202,
  localDate,
  membershipCount,
  readDownload,
  tombstones,
  transferOwnership,
  userExists,
} from './support/myData';

// 012 moji podatki (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px. Več uporabnikov je
// prijavljenih v ločenih kontekstih; stanja, ki jih vmesnik ne ustvari (povabila, prenos lastništva, arhiviranje), pripravi
// SQL (D-27); napake izvoza in stanje 202 simulira `page.route`, skupnih storitev se ne ustavlja.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const accountMenu = (page: Page) =>
  page.getByRole('button', { name: /^(Meni računa|Account menu)$/ });

async function signedInAs(page: Page, user: TestUser): Promise<TestUser> {
  await page.goto('/');
  await signIn(page, user);
  await expect(accountMenu(page)).toBeVisible();
  return user;
}

async function signedIn(page: Page, name = 'Ana Novak'): Promise<TestUser> {
  return signedInAs(page, uniqueUser(name));
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

const dataSection = (page: Page) => page.getByRole('region', { name: 'Moji podatki' });
const deleteSection = (page: Page) => page.getByRole('region', { name: 'Izbris računa' });
const downloadButton = (page: Page) =>
  dataSection(page).getByRole('button', { name: 'Prenesi moje podatke (JSON)' });
const deleteDialog = (page: Page) => page.getByRole('dialog', { name: 'Izbrišem račun?' });
const emailField = (page: Page) =>
  deleteDialog(page).getByRole('textbox', { name: 'Za potrditev vpiši svoj e-naslov' });
const trail = (page: Page) => page.getByRole('list', { name: 'Vnosi revizijske sledi' });
const MISMATCH = 'Vpisani e-naslov se ne ujema z tvojim.';

async function openAccount(page: Page) {
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();
}

async function openDeleteDialog(page: Page) {
  await deleteSection(page).getByRole('button', { name: 'Izbriši račun' }).click();
  await expect(deleteDialog(page)).toBeVisible();
  await expect(deleteDialog(page).getByRole('button', { name: 'Prekliči' })).toBeFocused();
}

async function confirmDeletion(page: Page, typed: string) {
  await emailField(page).fill(typed);
  await deleteDialog(page).getByRole('button', { name: 'Izbriši račun' }).click();
}

test.use({ locale: 'sl-SI' });

// ---------------------------------------------------------------------------------------------------------------
// Del 1: izvoz (US1)
// ---------------------------------------------------------------------------------------------------------------

test('FR-012-01 FR-012-02 FR-012-03: izvoz vsebuje članstva, povabila in skupine v lasti – brez kontaktov in drugih članov', async ({
  page,
  browser,
}) => {
  const ana = await signedIn(page, 'Ana Novak');
  const eva = await otherUser(browser, page, 'Eva Povabljena');
  const cene = await otherUser(browser, page, 'Cene Kanarcek');
  const owned = await createGroup(page, { title: 'Projekt FERI', description: 'Opis projekta' });
  addMember(owned, cene.user.email, 'EDITOR');
  addSentInvitation(owned, ana.email, eva.user.email, 'VIEWER');
  await createContactViaApi(page, owned, { firstName: 'KANARCEK-KONTAKT', lastName: 'Sled' });
  const evasGroup = await createGroup(eva.page, { title: 'Evina skupina' });
  addMember(evasGroup, ana.email, 'EDITOR');
  addReceivedInvitation(
    await createGroup(eva.page, { title: 'Evino povabilo' }),
    ana.email,
    eva.user.email,
    'EDITOR',
  );

  await openAccount(page);
  await expect(dataSection(page)).toContainText('Kontaktov in revizijskih sledi ne vsebuje.');
  const started = Date.now();
  const downloading = page.waitForEvent('download');
  await downloadButton(page).click();
  const download = await downloading;

  const expectedDates = new Set([localDate(new Date(started)), localDate()]);
  const match = /^moji-podatki-(\d{4}-\d{2}-\d{2})\.json$/.exec(download.suggestedFilename());
  expect(match).not.toBeNull();
  expect(expectedDates.has(match?.[1] ?? '')).toBe(true);
  await expect(dataSection(page).getByRole('status')).toHaveText('Podatki so preneseni.');
  expect(Date.now() - started).toBeLessThan(5_000);

  const text = await readDownload(download);
  const data = JSON.parse(text) as {
    formatVersion: number;
    profile: { email: string; name: string | null };
    memberships: { groupTitle: string; role: string; state: string }[];
    receivedInvitations: { groupTitle: string; sender: { name: string | null } }[];
    sentInvitations: { groupTitle: string; inviteeEmail: string }[];
    ownedGroups: { title: string; description: string | null; state: string }[];
  };
  expect(typeof data.formatVersion).toBe('number');
  expect(data.profile.email.toLowerCase()).toBe(ana.email.toLowerCase());
  expect(data.profile.name).toBe('Ana Novak');
  expect(data.memberships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ groupTitle: 'Projekt FERI', role: 'OWNER', state: 'ACTIVE' }),
      expect.objectContaining({ groupTitle: 'Evina skupina', role: 'EDITOR' }),
    ]),
  );
  expect(data.ownedGroups).toEqual([
    expect.objectContaining({
      title: 'Projekt FERI',
      description: 'Opis projekta',
      state: 'ACTIVE',
    }),
  ]);
  expect(data.sentInvitations).toEqual([
    expect.objectContaining({ groupTitle: 'Projekt FERI', inviteeEmail: eva.user.email }),
  ]);
  expect(data.receivedInvitations).toEqual([
    expect.objectContaining({
      groupTitle: 'Evino povabilo',
      sender: expect.objectContaining({ name: 'Eva Povabljena' }),
    }),
  ]);

  // FR-012-03: kanarčki – kontakti, sled, imena in e-naslovi drugih članov niso v izvozu.
  expect(text).not.toContain('KANARCEK-KONTAKT');
  expect(text).not.toContain('Cene Kanarcek');
  expect(text.toLowerCase()).not.toContain(cene.user.email.toLowerCase());
  expect(text).not.toMatch(/audit|revizij/i);

  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await eva.context.close();
  await cene.context.close();
});

test('FR-012-04: napaka izvoza – alert in »Poskusi znova«, brez datoteke; po odstranitvi poti izvoz uspe', async ({
  page,
}) => {
  await signedIn(page);
  await openAccount(page);
  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });
  const unroute = await failExport(page);

  await downloadButton(page).click();

  await expect(dataSection(page).getByRole('alert')).toHaveText(
    'Podatkov ni bilo mogoče pripraviti. Poskusi znova.',
  );
  await expect(dataSection(page).getByRole('button', { name: 'Poskusi znova' })).toBeVisible();
  expect(downloads).toBe(0);
  await expectNoAxeViolations(page);

  await unroute();
  const downloading = page.waitForEvent('download');
  await dataSection(page).getByRole('button', { name: 'Poskusi znova' }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toMatch(/^moji-podatki-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(dataSection(page).getByRole('status')).toHaveText('Podatki so preneseni.');
  await expect(dataSection(page).getByRole('alert')).toHaveCount(0);
  await expectNoAxeViolations(page);
});

// ---------------------------------------------------------------------------------------------------------------
// Del 2: blokada izbrisa (US3)
// ---------------------------------------------------------------------------------------------------------------

test('FR-012-06 SC-007: lastnik aktivne skupine vidi seznam s povezavami brez gumba; povezava odpre skupino; po arhiviranju je gumb viden', async ({
  page,
}) => {
  await signedIn(page);
  const first = await createGroup(page, { title: 'Blokada A' });
  const second = await createGroup(page, { title: 'Blokada B' });

  await openAccount(page);

  const list = deleteSection(page).getByRole('list', {
    name: 'Skupine, ki preprečujejo izbris računa',
  });
  await expect(list.getByRole('link')).toHaveText(['Blokada A', 'Blokada B']);
  await expect(deleteSection(page)).toContainText('Prenesi lastništvo ali arhiviraj te skupine');
  await expect(deleteSection(page).getByRole('button', { name: 'Izbriši račun' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await list.getByRole('link', { name: 'Blokada A' }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${first}/`));
  await expect(page.getByRole('heading', { level: 1, name: 'Blokada A' })).toBeVisible();

  archive(first);
  archive(second);
  await openAccount(page);

  await expect(deleteSection(page).getByRole('button', { name: 'Izbriši račun' })).toBeVisible();
  await expect(deleteSection(page).getByRole('list')).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('FR-012-13: med odprtim dialogom drug uporabnik prenese lastništvo – 409, sporočilo, osvežen seznam, račun obstaja', async ({
  page,
  browser,
}) => {
  const ana = await signedIn(page, 'Ana Novak');
  const eva = await otherUser(browser, page, 'Eva Lastnica');
  const id = await createGroup(eva.page, { title: 'Skupina za prenos' });
  addMember(id, ana.email, 'ADMIN');
  await openAccount(page);
  await openDeleteDialog(page);
  await emailField(page).fill(ana.email);

  transferOwnership(id, eva.user.email, ana.email);
  await deleteDialog(page).getByRole('button', { name: 'Izbriši račun' }).click();

  await expect(deleteDialog(page)).toHaveCount(0);
  await expect(deleteSection(page).getByRole('alert')).toHaveText(
    'Račun ne more biti izbrisan, ker si medtem postal lastnik nearhivirane skupine. Prenesi lastništvo ali arhiviraj te skupine.',
  );
  await expect(
    deleteSection(page)
      .getByRole('list', { name: 'Skupine, ki preprečujejo izbris računa' })
      .getByRole('link', { name: 'Skupina za prenos' }),
  ).toBeVisible();
  await expect(deleteSection(page).getByRole('heading', { level: 2 })).toBeFocused();
  await expect(deleteSection(page).getByRole('button', { name: 'Izbriši račun' })).toHaveCount(0);
  expect(userExists(ana.email)).toBe(true);
  expect(memberCount(id)).toBe(2);
  await expectNoAxeViolations(page);
  await eva.context.close();
});

// ---------------------------------------------------------------------------------------------------------------
// Del 3: izbris računa (US2)
// ---------------------------------------------------------------------------------------------------------------

test('FR-012-07: napačen e-naslov – napaka ob polju, nič izbrisano; Prekliči vrne fokus na gumb', async ({
  page,
}) => {
  const ana = await signedIn(page);
  await openAccount(page);
  await openDeleteDialog(page);

  await confirmDeletion(page, 'nekdo.drug@primer.si');

  await expect(emailField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(emailField(page)).toHaveAccessibleDescription(MISMATCH);
  await expect(deleteDialog(page)).toBeVisible();
  expect(userExists(ana.email)).toBe(true);
  await expectNoAxeViolations(page);

  await deleteDialog(page).getByRole('button', { name: 'Prekliči' }).click();

  await expect(deleteDialog(page)).toHaveCount(0);
  await expect(deleteSection(page).getByRole('button', { name: 'Izbriši račun' })).toBeFocused();
  expect(userExists(ana.email)).toBe(true);
});

test('FR-012-05 FR-012-07 FR-012-08 FR-012-09 FR-012-11 FR-012-12 FR-012-14 FR-012-15 FR-012-18 SC-003 SC-005: izbris računa – drugi vidijo »izbrisan uporabnik«, druga naprava 401, ponovna prijava da nov prazen račun', async ({
  page,
  browser,
}) => {
  const ana = await signedIn(page, 'Ana Novak');
  const eva = await otherUser(browser, page, 'Eva Lastnica');
  const dana = await otherUser(browser, page, 'Dana Povabljena');
  const device2Context = await browser.newContext({
    locale: 'sl-SI',
    viewport: page.viewportSize() ?? undefined,
  });
  const device2 = await device2Context.newPage();
  await signedInAs(device2, ana);

  // B: arhivirana skupina v lasti Ane z drugim članom; C: arhivirana, Ana edina članica.
  const groupB = await createGroup(page, { title: 'Skupina B' });
  addMember(groupB, eva.user.email, 'EDITOR');
  archive(groupB);
  const groupC = await createGroup(page, { title: 'Skupina C' });
  archive(groupC);
  // F: Evina skupina, v kateri je Ana urednica in je ustvarila kontakt (sled); X: Ana je poslala povabilo Dani.
  const groupF = await createGroup(eva.page, { title: 'Skupina F' });
  setRole(groupF, ana.email, 'EDITOR');
  await createContactViaApi(page, groupF, { firstName: 'Janez', lastName: 'Sled' });
  addSentInvitation(groupF, ana.email, dana.user.email, 'VIEWER');
  expect(invitationExists(groupF, dana.user.email)).toBe(true);
  await openAccount(device2);

  await openAccount(page);
  await expect(deleteSection(page)).toContainText('Izbris je nepovraten.');
  await expectNoAxeViolations(page);
  await openDeleteDialog(page);
  await expectNoAxeViolations(page);
  await confirmDeletion(page, 'napacen@primer.si');
  await expect(emailField(page)).toHaveAccessibleDescription(MISMATCH);
  expect(userExists(ana.email)).toBe(true);
  expect(groupExists(groupB)).toBe(true);

  const started = Date.now();
  await confirmDeletion(page, `  ${ana.email.toUpperCase()}  `);

  await expect(page).toHaveURL(/\/login\?reason=account-deleted$/);
  await expect(page.getByRole('status')).toHaveText('Tvoj račun je izbrisan.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(Date.now() - started).toBeLessThan(60_000);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  expect(userExists(ana.email)).toBe(false);
  expect(groupExists(groupC)).toBe(false);
  expect(groupExists(groupB)).toBe(true);
  expect(tombstones().length).toBeGreaterThan(0);

  // Drugi člani: B je trajno arhivirana z lastnikom »izbrisan uporabnik«, C ne obstaja.
  await eva.page.goto('/groups/archived');
  const itemB = eva.page
    .getByRole('listitem')
    .filter({ has: eva.page.getByRole('link', { name: 'Skupina B' }) });
  await expect(itemB).toContainText('lastnik: izbrisan uporabnik');
  await expect(eva.page.getByRole('link', { name: 'Skupina C' })).toHaveCount(0);
  await eva.page.goto(`/groups/${groupB}/settings`);
  await expect(eva.page.getByRole('row', { name: /izbrisan uporabnik/ })).toContainText('Lastnik');
  await expectNoAxeViolations(eva.page);
  // Sled skupine F: izvajalec je »izbrisan uporabnik«.
  await eva.page.goto(`/groups/${groupF}/audit`);
  await expect(trail(eva.page).getByRole('listitem').first()).toContainText('izbrisan uporabnik');
  await expectNoAxeViolations(eva.page);
  // Poslano povabilo X ostane veljavno, pošiljatelj je »izbrisan uporabnik«.
  expect(invitationExists(groupF, dana.user.email)).toBe(true);
  await dana.page.goto('/invitations');
  await expect(dana.page.getByRole('listitem').first()).toContainText(
    'Povabil(a): izbrisan uporabnik',
  );
  await expectNoAxeViolations(dana.page);

  // Druga naprava: seja izbrisanega računa ne velja več – prvi zahtevek je 401 in vodi na prijavo.
  await downloadButton(device2).click();
  await expect(device2).toHaveURL(/\/login/);
  await expect(device2.getByRole('button', { name: 'Prijava z Googlom' })).toBeVisible();

  // Ponovna prijava z istim Google računom: nov, prazen račun.
  await signIn(page, ana);
  await expect(accountMenu(page)).toBeVisible();
  expect(userExists(ana.email)).toBe(true);
  expect(membershipCount(ana.email)).toBe(0);
  await expect(page).not.toHaveURL(/\/login/);
  await openAccount(page);
  await expect(page.getByRole('region', { name: 'Profil' })).toContainText(ana.email);
  await expect(deleteSection(page).getByRole('button', { name: 'Izbriši račun' })).toBeVisible();
  await expectNoAxeViolations(page);

  await eva.context.close();
  await dana.context.close();
  await device2Context.close();
});

test('FR-012-17: stanje 202 – prijava s sporočilom o čakanju brisanja identitete; zaledje se ne pokliče', async ({
  page,
}) => {
  const ana = await signedIn(page);
  const fake = await fakeDeletion202(page);
  await openAccount(page);
  await openDeleteDialog(page);

  await confirmDeletion(page, ana.email);

  await expect(page).toHaveURL(/\/login\?reason=account-deleted-pending$/);
  await expect(page.getByRole('status')).toContainText('Tvoj račun je izbrisan.');
  await expect(page.getByRole('status')).toContainText(
    'se z istim Google računom nekaj časa morda ne boš mogel znova registrirati',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(fake.calls()).toBe(1);
  expect(userExists(ana.email)).toBe(true);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});
