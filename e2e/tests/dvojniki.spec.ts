import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { auditEntryCount, contactRow, lastAuditEntry } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import {
  attributesOf,
  contactByEmail,
  contactCountIn,
  contactExists,
  contactsWithEmail,
  editedByOther,
  seedContact,
  seedDuplicates,
  tagsOf,
  versionOf,
} from './support/duplicates';
import { archive, createGroup, type Role, setRole, sql } from './support/groups';

// 011 dvojniki: iskanje, primerjava in združitev (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in
// 1280 px. Kontakte pripravi SQL (D-27, brez vnosov sledi); kontaktov, ki jih test briše prek vmesnika, ni.
// Razveljavitev združitve (SC-005): kontakti iz SQL nimajo vnosov *dodajanja*, zato je točka »tik pred združitvijo«
// kar »Začetno stanje« sledi (005, FR-005-20).

test.describe.configure({ timeout: 120_000 });

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

/** Član v ločenem kontekstu brskalnika (slovenski vmesnik), z vlogo v skupini. */
async function memberPage(browser: Browser, page: Page, groupId: string, name: string, role: Role) {
  const context = await browser.newContext({
    locale: 'sl-SI',
    viewport: page.viewportSize() ?? undefined,
  });
  const member = await context.newPage();
  const user = await signedIn(member, name);
  setRole(groupId, user.email, role);
  return { context, page: member, user };
}

const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const sections = (page: Page) => page.getByRole('navigation', { name: 'Razdelki skupine' });
const dialog = (page: Page) => page.getByRole('alertdialog');
const alerts = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

/** Ime kontakta iz `seedDuplicates` (n od 1). */
const nm = (n: number) => `Ime${String(n).padStart(2, '0')} Priimek${String(n).padStart(2, '0')}`;

const iso = (n: number) => new Date(Date.parse('2026-01-01T00:00:00Z') + n * 1000).toISOString();

async function openContacts(page: Page, groupId: string) {
  await page.goto(`/groups/${groupId}/contacts`);
  await expect(sections(page).getByRole('link', { name: 'Kontakti' })).toBeVisible();
}

/** Odpre zavihek *Dvojniki*, izbere e-naslov in poišče (vsak korak je klik). */
async function searchByEmail(page: Page, groupId: string) {
  await openContacts(page, groupId);
  await sections(page).getByRole('link', { name: 'Dvojniki' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Dvojniki' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Kategorija' })
    .getByRole('radio', { name: 'E-naslov' })
    .check();
  await page.getByRole('button', { name: 'Poišči dvojnike' }).click();
}

const card = (page: Page, email: string) =>
  page.getByRole('listitem', { name: `Enak e-naslov: ${email}` });

/** Potrdi združitev: »Združi kontakte« → alertdialog → potrditev (zadnji gumb). */
async function mergeAndConfirm(page: Page) {
  await page.getByRole('button', { name: 'Združi kontakte' }).click();
  await dialog(page)
    .getByRole('button', { name: /^Združi \d+ kontakt/ })
    .click();
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/**
 * FR-011-21 (scenarij 10): pri `total` > 10 je razlaga vidna nad prvim poljem, brez vodoravnega drsenja strani;
 * predogled in »Združi kontakte« sta dosegljiva – pravi klik brez `force` (Playwright pred klikom preveri, da
 * element ni prekrit) odpre potrditev, »Prekliči« jo zapre.
 */
async function expectLongCompareLayout(page: Page, total: number) {
  const note = page.getByRole('status').filter({ hasText: `Prikazanih je prvih 10 od ${total}` });
  await expect(note).toBeVisible();
  const firstField = page.getByRole('group', { name: 'Ime', exact: true });
  await expect(firstField).toBeVisible();
  const noteBox = await note.boundingBox();
  const fieldBox = await firstField.boundingBox();
  expect(noteBox).not.toBeNull();
  expect(fieldBox).not.toBeNull();
  expect(noteBox?.y ?? 0).toBeLessThan(fieldBox?.y ?? 0);
  expect(await noHorizontalScroll(page)).toBe(true);

  const preview = page.getByRole('region', { name: 'Predogled združenega kontakta' });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toBeVisible();
  const merge = page.getByRole('button', { name: 'Združi kontakte' });
  await expect(merge).toBeVisible();
  await merge.click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Prekliči' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
}

/** Skupina dvojnikov z danim e-naslovom: iskanje, primerjava, združitev s privzetimi izbirami. */
async function findAndMerge(page: Page, groupId: string, email: string) {
  await searchByEmail(page, groupId);
  await card(page, email).getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();
  await mergeAndConfirm(page);
  await expect(toast(page)).toContainText('Združenih kontaktov:');
}

test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

// --- (1) hitra združitev, največ 4 kliki; sl in en -------------------------------------------------------------------

test('FR-011-01 FR-011-02 FR-011-04 FR-011-07 FR-011-08 FR-011-14 FR-011-15 FR-011-18 SC-001: urednik združi dva kontakta v štirih klikih – toast, rezultati brez skupine, drugi kontakt 404 (sl)', async ({
  page,
}) => {
  // Pravi uporabniški kliki (`isTrusted`) v zajemni fazi; števec se ponastavi ob začetku merila.
  await page.addInitScript(() => {
    const counter = window as unknown as { __clicks: number };
    counter.__clicks = 0;
    document.addEventListener(
      'click',
      (event) => {
        if (event.isTrusted) counter.__clicks += 1;
      },
      true,
    );
  });
  const clickCount = () =>
    page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const first = seedContact(groupId, {
    first: 'Janez',
    last: 'Novak',
    email: 'janez@primer.si',
    createdAt: iso(1),
  });
  const second = seedContact(groupId, {
    first: 'Janez',
    last: 'Novak',
    email: 'janez@primer.si',
    createdAt: iso(2),
  });

  await openContacts(page, groupId);
  await sections(page).getByRole('link', { name: 'Dvojniki' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Dvojniki' })).toBeVisible();
  await expectNoAxeViolations(page);

  // SC-001: največ štirje kliki od odprtja zavihka *Dvojniki* s privzeto kategorijo (*Poišči dvojnike*,
  // *Primerjaj in združi*, *Združi kontakte*, potrditev); štetje se začne, ko je zavihek odprt.
  await page.evaluate(() => {
    (window as unknown as { __clicks: number }).__clicks = 0;
  });
  await page.getByRole('button', { name: 'Poišči dvojnike' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Skupin dvojnikov: 1' })).toBeVisible();
  const group = page.getByRole('listitem', { name: 'Enako ime in priimek: Janez Novak' });
  await expect(group).toBeVisible();
  await expectNoAxeViolations(page);
  await group.getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Združi kontakte' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAccessibleName('Združim 2 kontakta?');
  await expectNoAxeViolations(page);
  await dialog(page).getByRole('button', { name: 'Združi 2 kontakta' }).click();
  expect(await clickCount()).toBeLessThanOrEqual(4);
  expect(await clickCount()).toBeGreaterThanOrEqual(4);

  await expect(toast(page)).toContainText('Združenih kontaktov: 2. Ostal je kontakt Janez Novak.');
  await expect(page.getByRole('heading', { level: 2, name: 'Dvojniki' })).toBeVisible();
  await expect(group).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Ni dvojnikov po kategoriji Ime in priimek.' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  expect(contactsWithEmail(groupId, 'janez@primer.si')).toBe(1);
  expect(contactExists(first)).toBe(true);
  expect(contactExists(second)).toBe(false);
  await page.goto(`/groups/${groupId}/contacts/${second}`);
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    await expect(page.getByRole('region', { name: 'Podrobnosti kontakta' })).toContainText(
      'Tega kontakta ni več',
    );
  } else {
    await expect(page.getByRole('heading', { name: 'Te strani ni' })).toBeVisible();
  }
  await expectNoAxeViolations(page);
});

test('FR-011-01 FR-011-02 FR-011-07 FR-011-08 FR-011-14 FR-011-15 FR-011-18 SC-001: urednik združi dva kontakta – angleški vmesnik', async ({
  page,
  browser,
}) => {
  const user = await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  seedContact(groupId, {
    first: 'Janez',
    last: 'Novak',
    email: 'janez@primer.si',
    createdAt: iso(1),
  });
  const second = seedContact(groupId, {
    first: 'Janez',
    last: 'Novak',
    email: 'janez@primer.si',
    createdAt: iso(2),
  });

  const context = await browser.newContext({
    locale: 'en-US',
    viewport: page.viewportSize() ?? undefined,
  });
  const en = await context.newPage();
  await en.goto('/');
  await signIn(en, user);
  await expect(en.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await en.goto(`/groups/${groupId}/contacts`);
  await en
    .getByRole('navigation', { name: 'Group sections' })
    .getByRole('link', { name: 'Duplicates' })
    .click();
  await expect(en.getByRole('heading', { level: 2, name: 'Duplicates' })).toBeVisible();
  await expectNoAxeViolations(en);
  await en
    .getByRole('radiogroup', { name: 'Category' })
    .getByRole('radio', { name: 'Email' })
    .check();
  await en.getByRole('button', { name: 'Find duplicates' }).click();
  const group = en.getByRole('listitem', { name: 'Same email: janez@primer.si' });
  await expect(group).toBeVisible();
  await expectNoAxeViolations(en);
  await group.getByRole('button', { name: 'Compare and merge' }).click();
  await expect(en.getByRole('heading', { level: 2, name: 'Compare duplicates' })).toBeVisible();
  await expectNoAxeViolations(en);
  await en.getByRole('button', { name: 'Merge contacts' }).click();
  await expect(en.getByRole('alertdialog')).toHaveAccessibleName('Merge 2 contacts?');
  await expectNoAxeViolations(en);
  await en.getByRole('alertdialog').getByRole('button', { name: 'Merge 2 contacts' }).click();

  await expect(en.getByRole('region', { name: 'Notifications' })).toContainText(
    'Merged contacts: 2. Contact Janez Novak was kept.',
  );
  await expect(
    en.getByRole('status').filter({ hasText: 'No duplicates in category Email.' }),
  ).toBeVisible();
  await expectNoAxeViolations(en);
  expect(contactsWithEmail(groupId, 'janez@primer.si')).toBe(1);
  await en.goto(`/groups/${groupId}/contacts/${second}`);
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    await expect(en.getByRole('region', { name: 'Contact details' })).toContainText(
      'This contact no longer exists',
    );
  } else {
    await expect(en.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
  await context.close();
});

// --- (2) naslov strani, osvežitev in Nazaj ---------------------------------------------------------------------------

test('FR-011-02 FR-011-07: naslov strani vsebuje kategorijo – osvežitev in Nazaj ohranita rezultat', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  seedDuplicates(groupId, 3, 'janez@primer.si');

  await searchByEmail(page, groupId);
  await expect(card(page, 'janez@primer.si')).toBeVisible();
  await expect(page).toHaveURL(/category=email/);

  await page.reload();
  await expect(page).toHaveURL(/category=email/);
  await expect(card(page, 'janez@primer.si')).toBeVisible();
  await expect(
    page.getByRole('radiogroup', { name: 'Kategorija' }).getByRole('radio', { name: 'E-naslov' }),
  ).toBeChecked();

  await card(page, 'janez@primer.si').getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/category=email/);
  await expect(card(page, 'janez@primer.si')).toBeVisible();
  await expectNoAxeViolations(page);
});

// --- (3) primerjava treh kontaktov -----------------------------------------------------------------------------------

test('FR-011-09 FR-011-10 FR-011-11 FR-011-12 FR-011-15: primerjava treh kontaktov – izbira telefona, značke, predogled, izločitev tretjega, ohranjeni v bazi z izbranimi vrednostmi', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const email = 'janez@primer.si';
  const a = seedContact(groupId, {
    first: 'Janez',
    last: 'Novak',
    email,
    phone: '041 111 222',
    tags: ['vip', 'konferenca2025'],
    attributes: [{ key: 'kompetenca', value: 'web dev' }],
    createdAt: iso(1),
  });
  const b = seedContact(groupId, {
    first: 'Janez',
    last: 'Novak',
    email,
    phone: '040 333 444',
    tags: ['alumni'],
    attributes: [{ key: 'kompetenca', value: 'java' }],
    createdAt: iso(2),
  });
  const c = seedContact(groupId, {
    first: 'Janezek',
    last: 'Novak',
    email,
    phone: '051 555 666',
    tags: ['sponzor'],
    attributes: [{ key: 'kompetenca', value: 'rust' }],
    createdAt: iso(3),
  });

  await searchByEmail(page, groupId);
  await card(page, email).getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();

  // »Ostane« samo pri najstarejšem (prvem stolpcu).
  const columns = page.getByRole('group', { name: 'Janez Novak', exact: true });
  await expect(columns).toHaveCount(2);
  await expect(columns.first()).toContainText('Ostane');
  await expect(columns.nth(1)).not.toContainText('Ostane');

  const preview = page.getByRole('region', { name: 'Predogled združenega kontakta' });
  await expect(preview).toContainText('041 111 222');
  await page
    .getByRole('group', { name: 'Telefon', exact: true })
    .getByRole('radio', { name: '040 333 444' })
    .check();
  await expect(preview).toContainText('040 333 444');
  await expect(preview).not.toContainText('041 111 222');

  await page
    .getByRole('group', { name: /^kompetenca$/i })
    .getByRole('radio', { name: 'java' })
    .check();
  await expect(preview).toContainText('java');

  const tags = page.getByRole('group', { name: 'Značke', exact: true });
  await expect(tags.getByRole('checkbox')).toHaveCount(4);
  await tags.getByRole('checkbox', { name: 'alumni' }).uncheck();
  await expect(preview).not.toContainText('alumni');
  await expect(preview).toContainText('konferenca2025');
  await expectNoAxeViolations(page);

  // Izločitev tretjega kontakta: stolpec in njegova značka izgineta, naslov strani se posodobi.
  await page
    .getByRole('group', { name: 'Janezek Novak', exact: true })
    .getByRole('button', { name: 'Izloči iz združevanja' })
    .click();
  await expect(page.getByRole('group', { name: 'Janezek Novak', exact: true })).toHaveCount(0);
  await expect(tags.getByRole('checkbox', { name: 'sponzor' })).toHaveCount(0);
  await expect(preview).not.toContainText('sponzor');
  await expect(columns.first()).toContainText('Ostane');
  // Ostaneta dva kontakta: izločanje ni več mogoče, namesto gumba je razlaga (FR-011-11).
  await expect(
    page.getByRole('note').filter({ hasText: 'Združiti je treba vsaj 2 kontakta.' }),
  ).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Izloči iz združevanja' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Združi kontakte' }).click();
  await expect(dialog(page)).toHaveAccessibleName('Združim 2 kontakta?');
  await dialog(page).getByRole('button', { name: 'Združi 2 kontakta' }).click();
  await expect(toast(page)).toContainText('Združenih kontaktov: 2. Ostal je kontakt Janez Novak.');

  // Ohranjeni kontakt je najstarejši, z dobesednimi izbranimi vrednostmi; tretji ostane nedotaknjen.
  expect(contactByEmail(groupId, email)).toBe(a);
  expect(contactExists(b)).toBe(false);
  expect(contactExists(c)).toBe(true);
  expect(contactRow(a)?.phone).toBe('040 333 444');
  expect(tagsOf(a).sort()).toEqual(['konferenca2025', 'vip']);
  expect(attributesOf(a)).toEqual([{ key: 'kompetenca', value: 'java' }]);
  expect(contactsWithEmail(groupId, email)).toBe(2);
});

// --- (4) konflikt verzij ---------------------------------------------------------------------------------------------

test('FR-011-16: drug uporabnik spremeni kontakt med primerjavo – opozorilo konflikta, ponovna združitev uspe', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const [first, second] = seedDuplicates(groupId, 2, 'janez@primer.si');
  if (!first || !second) throw new Error('kontakta nista pripravljena');

  await searchByEmail(page, groupId);
  await card(page, 'janez@primer.si').getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();

  editedByOther(second, '041 999 888');
  await mergeAndConfirm(page);

  const conflict = alerts(
    page,
    'Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.',
  );
  await expect(conflict).toBeVisible();
  await expectNoAxeViolations(page);
  expect(contactExists(first)).toBe(true);
  expect(contactExists(second)).toBe(true);
  await expect(page.getByRole('region', { name: 'Predogled združenega kontakta' })).toContainText(
    '041 999 888',
  );

  await mergeAndConfirm(page);
  await expect(toast(page)).toContainText('Združenih kontaktov: 2.');
  expect(contactsWithEmail(groupId, 'janez@primer.si')).toBe(1);
  expect(contactExists(second)).toBe(false);
});

// --- (5) skupina s 14 kontakti ---------------------------------------------------------------------------------------

test('FR-011-07 FR-011-08 FR-011-18 FR-011-21: 14 kontaktov – »Še 4 kontakti«, prvih 10 v primerjavi, po združitvi spet skupina, nato en kontakt', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const email = 'skupina@primer.si';
  seedDuplicates(groupId, 14, email);

  await searchByEmail(page, groupId);
  const group = card(page, email);
  await expect(group.getByRole('button', { name: 'Še 4 kontakti' })).toBeVisible();
  await group.getByRole('button', { name: 'Še 4 kontakti' }).click();
  await expect(
    group
      .getByRole('list', { name: 'Kontakti v skupini' })
      .getByRole('listitem')
      .filter({ hasText: nm(14) }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  await group.getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({
      hasText:
        'Prikazanih je prvih 10 od 14 kontaktov. Ostali ostanejo nespremenjeni in jih lahko združiš v naslednjem koraku.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: nm(10), exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: nm(11), exact: true })).toHaveCount(0);
  await expectLongCompareLayout(page, 14);
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: 'Združi kontakte' }).click();
  await expect(dialog(page)).toHaveAccessibleName('Združim 10 kontaktov?');
  await dialog(page).getByRole('button', { name: 'Združi 10 kontaktov' }).click();
  await expect(toast(page)).toContainText(`Združenih kontaktov: 10. Ostal je kontakt ${nm(1)}.`);
  expect(contactsWithEmail(groupId, email)).toBe(5);

  // Ohranjeni kontakt in preostali 4 so spet ena skupina; razlage »prvih 10« ni (total ≤ 10).
  await expect(
    group.getByRole('list', { name: 'Kontakti v skupini' }).getByRole('listitem'),
  ).toHaveCount(5);
  await group.getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Prikazanih je prvih 10' })).toHaveCount(
    0,
  );
  await mergeAndConfirm(page);
  await expect(toast(page)).toContainText('Združenih kontaktov: 5.');
  expect(contactsWithEmail(groupId, email)).toBe(1);
  await expect(card(page, email)).toHaveCount(0);
});

// --- (6) 360 px: brez vodoravnega drsenja, fieldset, tarče, tipkovnica ----------------------------------------------

test('FR-011-09 FR-011-12 FR-011-14 FR-011-21: primerjava 10 od 14 kontaktov – brez vodoravnega drsenja, skupina na polje, tarče dotika, samo tipkovnica, axe', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const email = 'skupina@primer.si';
  for (let n = 1; n <= 14; n += 1) {
    seedContact(groupId, {
      first: `Ime${String(n).padStart(2, '0')}`,
      last: `Priimek${String(n).padStart(2, '0')}`,
      email,
      phone: `040 000 ${String(n).padStart(3, '0')}`,
      tags: n === 1 ? ['vip'] : [],
      createdAt: iso(n),
    });
  }
  const width = page.viewportSize()?.width ?? 0;

  // Iskanje samo s tipkovnico.
  await openContacts(page, groupId);
  await sections(page).getByRole('link', { name: 'Dvojniki' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Dvojniki' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Kategorija' })
    .getByRole('radio', { name: 'E-naslov' })
    .focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Poišči dvojnike' }).focus();
  await page.keyboard.press('Enter');
  const group = card(page, email);
  await expect(group).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectNoAxeViolations(page);

  await group.getByRole('button', { name: 'Primerjaj in združi' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectLongCompareLayout(page, 14);
  await expectNoAxeViolations(page);

  // Vsako različno polje je skupina z imenom; privzeto so izbrane prve vrednosti.
  for (const field of ['Ime', 'Priimek', 'Telefon']) {
    await expect(page.getByRole('group', { name: field, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('group', { name: 'Značke', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Predogled združenega kontakta' })).toBeVisible();

  if (width <= 360) {
    // Tarča dotika izbirnega gumba in potrditvenega polja je njuna oznaka (label), kot v ostalem projektu.
    const inputs = [
      ...(await page.getByRole('radio').all()),
      ...(await page.getByRole('checkbox').all()),
    ];
    const boxes = [];
    for (const input of inputs) {
      boxes.push(
        await input.evaluate((element) => {
          const { width, height } = (element.closest('label') ?? element).getBoundingClientRect();
          return { width, height };
        }),
      );
    }
    for (const target of [
      ...(await page.getByRole('button', { name: 'Izloči iz združevanja' }).all()),
      page.getByRole('button', { name: 'Združi kontakte' }),
    ]) {
      boxes.push((await target.boundingBox()) ?? { width: 0, height: 0 });
    }
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }

  // Izbira vrednosti in potrditev samo s tipkovnico.
  const phone = page
    .getByRole('group', { name: 'Telefon', exact: true })
    .getByRole('radio', { name: '040 000 003' });
  await phone.focus();
  await page.keyboard.press('Space');
  await expect(phone).toBeChecked();
  await expect(page.getByRole('region', { name: 'Predogled združenega kontakta' })).toContainText(
    '040 000 003',
  );
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectLongCompareLayout(page, 14);

  await page.getByRole('button', { name: 'Združi kontakte' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveAccessibleName('Združim 10 kontaktov?');
  await expect(dialog(page).getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Tab');
  await expect(dialog(page).getByRole('button', { name: 'Združi 10 kontaktov' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText('Združenih kontaktov: 10.');
  expect(contactsWithEmail(groupId, email)).toBe(5);
});

// --- (6b) 320 px ---------------------------------------------------------------------------------------------------

// Viewport 320 px nastavi test sam; playwright.config.ts ima samo projekte 360/768/1280, zato test teče v vsakem
// projektu z istim viewportom (brez izpuščanja).
test('FR-011-21: primerjava je uporabna pri 320 px – brez vodoravnega drsenja, razlaga nad prvim poljem, klik na »Združi kontakte«, axe', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const email = 'skupina@primer.si';
  for (let n = 1; n <= 14; n += 1) {
    seedContact(groupId, {
      first: `Ime${String(n).padStart(2, '0')}`,
      last: `Priimek${String(n).padStart(2, '0')}`,
      email,
      phone: `040 000 ${String(n).padStart(3, '0')}`,
      createdAt: iso(n),
    });
  }
  await page.setViewportSize({ width: 320, height: 800 });

  await searchByEmail(page, groupId);
  await card(page, email).getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectLongCompareLayout(page, 14);
  await expectNoAxeViolations(page);
});

// --- (7) bralec in arhivirana skupina --------------------------------------------------------------------------------

test('FR-011-01 FR-011-19: bralec – zavihka ni, neposredna pot pokaže razlago brez obrazca', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  seedDuplicates(groupId, 2, 'janez@primer.si');
  const viewer = await memberPage(browser, page, groupId, 'Vesna Bralec', 'VIEWER');

  await openContacts(viewer.page, groupId);
  await expect(sections(viewer.page).getByRole('link', { name: 'Dvojniki' })).toHaveCount(0);

  for (const path of ['duplicates', 'duplicates/compare']) {
    await viewer.page.goto(`/groups/${groupId}/${path}`);
    await expect(
      viewer.page
        .getByRole('note')
        .filter({ hasText: 'Dvojnike lahko išče in združuje urednik ali višja vloga.' }),
    ).toBeVisible();
    await expect(viewer.page.getByRole('radiogroup', { name: 'Kategorija' })).toHaveCount(0);
    await expect(viewer.page.getByRole('button', { name: 'Poišči dvojnike' })).toHaveCount(0);
    await expect(viewer.page.getByRole('link', { name: 'Na kontakte skupine' })).toBeVisible();
    await expectNoAxeViolations(viewer.page);
  }
  await viewer.context.close();
});

test('FR-011-01 FR-011-19: arhivirana skupina – zavihka ni, neposredna pot pokaže razlago o arhivu', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  seedDuplicates(groupId, 2, 'janez@primer.si');
  archive(groupId);

  await openContacts(page, groupId);
  await expect(sections(page).getByRole('link', { name: 'Dvojniki' })).toHaveCount(0);
  for (const path of ['duplicates', 'duplicates/compare']) {
    await page.goto(`/groups/${groupId}/${path}`);
    await expect(
      page
        .getByRole('note')
        .filter({ hasText: 'Skupina je arhivirana – iskanje dvojnikov ni na voljo.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Poišči dvojnike' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Na kontakte skupine' })).toBeVisible();
    await expectNoAxeViolations(page);
  }
  expect(contactCountIn(groupId)).toBe(2);
});

// --- (8) 40 dvojnikov v petih krogih ---------------------------------------------------------------------------------

test('FR-011-07 FR-011-15 FR-011-17 FR-011-21 SC-003: 40 dvojnikov – pet krogov združevanja po 10, vsak krog natanko en nov vnos, ostali kontakti nespremenjeni', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const email = 'skupina@primer.si';
  let alive = seedDuplicates(groupId, 40, email);
  expect(alive).toHaveLength(40);
  const baseline = auditEntryCount(groupId);

  await searchByEmail(page, groupId);
  await expect(page.getByRole('status').filter({ hasText: 'Skupin dvojnikov: 1' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: `Enak e-naslov: ${email}` })).toHaveCount(1);
  await expect(card(page, email).getByRole('button', { name: 'Še 30 kontaktov' })).toBeVisible();

  for (let round = 1; round <= 5; round += 1) {
    const merged = alive.slice(0, 10);
    const others = alive.slice(10);
    const versions = others.map((id) => versionOf(id));
    const group = card(page, email);
    await expect(group).toBeVisible();
    if (others.length > 0) {
      await expect(
        group.getByRole('button', { name: new RegExp(`^Še ${others.length} kontakt`) }),
      ).toBeVisible();
    }
    await group.getByRole('button', { name: 'Primerjaj in združi' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' }),
    ).toBeVisible();
    await expect(page.getByRole('group', { name: nm(1), exact: true })).toBeVisible();
    await mergeAndConfirm(page);
    await expect(toast(page)).toContainText(
      `Združenih kontaktov: ${merged.length}. Ostal je kontakt ${nm(1)}.`,
    );

    await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toHaveCount(
      0,
    );

    // Natanko en nov vnos *združevanje*; ostali kontakti nespremenjeni.
    expect(auditEntryCount(groupId)).toBe(baseline + round);
    expect(lastAuditEntry(groupId)).toEqual({ action: 'MERGE', contactCount: merged.length });
    others.forEach((id, i) => {
      expect(contactExists(id)).toBe(true);
      expect(versionOf(id)).toBe(versions[i]);
    });
    merged.slice(1).forEach((id) => expect(contactExists(id)).toBe(false));
    alive = [merged[0] ?? '', ...others];
    expect(contactCountIn(groupId)).toBe(alive.length);

    if (alive.length > 1) {
      await expect(
        page.getByRole('status').filter({ hasText: 'Skupin dvojnikov: 1' }),
      ).toBeVisible();
      await expect(
        card(page, email).getByRole('list', { name: 'Kontakti v skupini' }).getByRole('listitem'),
      ).toHaveCount(Math.min(10, alive.length));
    }
  }

  expect(alive).toHaveLength(1);
  expect(contactsWithEmail(groupId, email)).toBe(1);
  await expect(card(page, email)).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Ni dvojnikov po kategoriji E-naslov.' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

// --- (9) revizijska sled po združitvi --------------------------------------------------------------------------------

test('FR-011-15 FR-011-17 FR-011-18 SC-003: vnos »združil(a) 3 kontakte« z izvajalcem in časom, povezava iz obvestila vodi na sled', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  seedDuplicates(groupId, 3, 'janez@primer.si');

  await searchByEmail(page, groupId);
  await card(page, 'janez@primer.si').getByRole('button', { name: 'Primerjaj in združi' }).click();
  await mergeAndConfirm(page);
  await expect(toast(page)).toContainText('Združenih kontaktov: 3.');
  await toast(page).getByRole('link', { name: 'Odpri revizijsko sled' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/audit$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Revizijska sled' })).toBeVisible();
  const entries = page
    .getByRole('list', { name: 'Vnosi revizijske sledi' })
    .getByRole('listitem')
    .filter({ hasNotText: /Začetno stanje/ });
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('združil(a) 3 kontakte');
  await expect(entries.first()).toContainText('Ana Novak');
  await expect(entries.first()).toContainText(/\d{1,2}[:.]\d{2}/);
  expect(auditEntryCount(groupId)).toBe(1);
  expect(lastAuditEntry(groupId)).toEqual({ action: 'MERGE', contactCount: 3 });
  await expectNoAxeViolations(page);
});

// --- (10) rollback admina --------------------------------------------------------------------------------------------

test('FR-011-17 SC-005: admin povrne skupino na točko pred združitvijo – kontakta spet obstajata z istima id in prvotnimi vrednostmi; urednik gumba nima', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const email = 'janez@primer.si';
  const ids = [1, 2, 3].map((n) =>
    seedContact(groupId, {
      first: `Janez${n}`,
      last: 'Novak',
      email,
      phone: `040 111 22${n}`,
      tags: [`znacka${n}`],
      createdAt: iso(n),
    }),
  );
  const editor = await memberPage(browser, page, groupId, 'Eva Urednik', 'EDITOR');
  const admin = await memberPage(browser, page, groupId, 'Admin Skupine', 'ADMIN');

  await findAndMerge(editor.page, groupId, email);
  expect(contactsWithEmail(groupId, email)).toBe(1);
  expect(contactExists(ids[1] ?? '')).toBe(false);
  expect(contactExists(ids[2] ?? '')).toBe(false);

  const button = 'Povrni skupino na to točko';
  const trail = (p: Page) => p.getByRole('list', { name: 'Vnosi revizijske sledi' });

  // Urednik sled vidi, gumba za rollback nima.
  await editor.page.goto(`/groups/${groupId}/audit`);
  await expect(trail(editor.page).getByRole('listitem').first()).toContainText(
    'združil(a) 3 kontakte',
  );
  await expect(editor.page.getByRole('button', { name: button })).toHaveCount(0);
  await expectNoAxeViolations(editor.page);

  // Admin: »Začetno stanje« je točka tik pred združitvijo (kontakti iz SQL nimajo vnosov dodajanja).
  await admin.page.goto(`/groups/${groupId}/audit`);
  const initial = trail(admin.page)
    .getByRole('listitem')
    .filter({ hasText: /Začetno stanje/ });
  await expect(initial).toBeVisible();
  await initial.getByRole('button', { name: button }).click();
  const confirm = admin.page.getByRole('dialog', { name: 'Povrnem skupino na začetno stanje?' });
  await expectNoAxeViolations(admin.page);
  await confirm.getByRole('button', { name: 'Povrni skupino' }).click();
  await expect(toast(admin.page)).toContainText('Skupina je povrnjena na začetno stanje.');

  ids.forEach((id, i) => {
    const n = i + 1;
    expect(contactExists(id)).toBe(true);
    expect(contactRow(id)?.firstName).toBe(`Janez${n}`);
    expect(contactRow(id)?.lastName).toBe('Novak');
    expect(contactRow(id)?.phone).toBe(`040 111 22${n}`);
    expect(tagsOf(id)).toEqual([`znacka${n}`]);
  });
  expect(contactsWithEmail(groupId, email)).toBe(3);
  expect(sql(`select count(*) from audit_entry where group_id = '${groupId}'::uuid`)).toBe('2');
  await editor.context.close();
  await admin.context.close();
});

// --- (11) matrika vlog v vmesniku in arhiviranje med primerjavo -----------------------------------------------------

test('FR-011-01 FR-011-15 FR-011-19 SC-006: OWNER, ADMIN in EDITOR vidijo zavihek in združijo, VIEWER zavihka nima', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const emails = {
    OWNER: 'owner@primer.si',
    ADMIN: 'admin@primer.si',
    EDITOR: 'editor@primer.si',
  };
  Object.values(emails).forEach((email) => seedDuplicates(groupId, 2, email));
  const admin = await memberPage(browser, page, groupId, 'Admin Skupine', 'ADMIN');
  const editor = await memberPage(browser, page, groupId, 'Eva Urednik', 'EDITOR');
  const viewer = await memberPage(browser, page, groupId, 'Vesna Bralec', 'VIEWER');

  for (const [who, member] of [
    ['OWNER', page],
    ['ADMIN', admin.page],
    ['EDITOR', editor.page],
  ] as const) {
    await openContacts(member, groupId);
    await expect(sections(member).getByRole('link', { name: 'Dvojniki' })).toBeVisible();
    await findAndMerge(member, groupId, emails[who]);
    expect(contactsWithEmail(groupId, emails[who])).toBe(1);
  }
  expect(contactCountIn(groupId)).toBe(3);

  await openContacts(viewer.page, groupId);
  await expect(sections(viewer.page).getByRole('link', { name: 'Dvojniki' })).toHaveCount(0);
  await expectNoAxeViolations(viewer.page);

  await admin.context.close();
  await editor.context.close();
  await viewer.context.close();
});

test('FR-011-19 SC-003 SC-006: skupina arhivirana med odprto primerjavo – potrditev pokaže sporočilo o arhivu, nič se ne spremeni', async ({
  page,
}) => {
  await signedIn(page);
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  const email = 'janez@primer.si';
  const ids = seedDuplicates(groupId, 2, email);
  const baseline = auditEntryCount(groupId);

  await searchByEmail(page, groupId);
  await card(page, email).getByRole('button', { name: 'Primerjaj in združi' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava dvojnikov' })).toBeVisible();

  archive(groupId);
  await mergeAndConfirm(page);

  await expect(alerts(page, 'Skupina je arhivirana. Spreminjanje ni mogoče.')).toBeVisible();
  await expectNoAxeViolations(page);
  expect(contactsWithEmail(groupId, email)).toBe(2);
  ids.forEach((id) => expect(contactExists(id)).toBe(true));
  expect(auditEntryCount(groupId)).toBe(baseline);
});
