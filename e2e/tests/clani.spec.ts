import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { auditCount, createContactViaApi } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import { archive, createGroup, makePermanentlyArchived, memberCount } from './support/groups';
import { addMember, memberExists, roleOf } from './support/members';

// 007 člani (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px; axe v slovenščini in angleščini.
// Uporabniki so prijavljeni v ločenih kontekstih; vloge, arhiviranje in trajno arhivirano skupino pripravi SQL (D-27).

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

async function signedIn(page: Page, name = 'Ana Novak'): Promise<TestUser> {
  const user = uniqueUser(name);
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: /^(Meni računa|Account menu)$/ })).toBeVisible();
  return user;
}

async function otherUser(browser: Browser, page: Page, name: string, locale = 'sl-SI') {
  const context = await browser.newContext({ locale, viewport: page.viewportSize() ?? undefined });
  const other = await context.newPage();
  const user = await signedIn(other, name);
  return { context, page: other, user };
}

const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const membersSection = (page: Page) => page.getByRole('region', { name: 'Člani' });
const management = (page: Page) => page.getByRole('region', { name: 'Upravljanje skupine' });
const openSettings = async (page: Page, groupId: string) => {
  await page.goto(`/groups/${groupId}/settings`);
  await expect(membersSection(page).getByRole('table', { name: 'Člani' })).toBeVisible();
};
const actionsFor = (page: Page, name: string) =>
  membersSection(page).getByRole('button', { name: `Dejanja za člana ${name}` });

async function openMenuItem(
  page: Page,
  name: string,
  item: 'Spremeni vlogo' | 'Odstrani iz skupine',
) {
  await actionsFor(page, name).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.use({ locale: 'sl-SI' });

test('FR-007-01 FR-007-02 SC-006: bralec vidi vse člane po vlogi, svojo vrstico z (ti), brez menijev dejanj', async ({
  page,
  browser,
}) => {
  const owner = await signedIn(page, 'Ana Novak');
  const admin = await otherUser(browser, page, 'Bojan Kos');
  const editor = await otherUser(browser, page, 'Cene Kralj');
  const viewer = await otherUser(browser, page, 'Dana Zupan');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, admin.user.email, 'ADMIN');
  addMember(id, editor.user.email, 'EDITOR');
  addMember(id, viewer.user.email, 'VIEWER');

  await openSettings(viewer.page, id);

  const rows = membersSection(viewer.page).getByRole('table', { name: 'Člani' }).getByRole('row');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(1).getByRole('cell', { name: 'Ana Novak' })).toBeVisible();
  await expect(rows.nth(1).getByRole('cell', { name: owner.email })).toBeVisible();
  await expect(rows.nth(1).getByRole('cell', { name: 'Lastnik', exact: true })).toBeVisible();
  await expect(rows.nth(2).getByRole('cell', { name: 'Admin', exact: true })).toBeVisible();
  await expect(rows.nth(3).getByRole('cell', { name: 'Urednik', exact: true })).toBeVisible();
  await expect(rows.nth(4)).toContainText('Dana Zupan (ti)');
  await expect(viewer.page.getByRole('button', { name: /^Dejanja za člana/ })).toHaveCount(0);
  await expectNoAxeViolations(viewer.page);
  await expectNoHorizontalScroll(viewer.page);
  await viewer.context.close();
  await admin.context.close();
  await editor.context.close();
});

test('FR-007-01 FR-007-02 SC-006: angleški vmesnik – imena stolpcev, vloge in axe', async ({
  browser,
  page,
}) => {
  await signedIn(page, 'Ana Novak');
  const viewer = await otherUser(browser, page, 'Dana Viewer', 'en-GB');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, viewer.user.email, 'VIEWER');

  await viewer.page.goto(`/groups/${id}/settings`);

  const table = viewer.page
    .getByRole('region', { name: 'Members' })
    .getByRole('table', { name: 'Members' });
  await expect(table).toBeVisible();
  for (const name of ['Member', 'Email', 'Role', 'Actions']) {
    await expect(table.getByRole('columnheader', { name })).toBeVisible();
  }
  await expect(table.getByRole('row').nth(2)).toContainText('Dana Viewer (you)');
  await expectNoAxeViolations(viewer.page);
  await viewer.page
    .getByRole('region', { name: 'Group management' })
    .getByRole('button', { name: 'Leave group' })
    .click();
  const enDialog = viewer.page.getByRole('dialog', { name: 'Leave Projekt FERI?' });
  await expect(enDialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectNoAxeViolations(viewer.page);
  await enDialog.getByRole('button', { name: 'Cancel' }).click();
  await viewer.context.close();
});

test('FR-007-03 SC-004 SC-006: lastnik spremeni bralca v admina v štirih dejanjih, admin nato vidi Povabi člana', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const viewer = await otherUser(browser, page, 'Dana Bralec');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, viewer.user.email, 'VIEWER');
  await openSettings(page, id);

  await actionsFor(page, 'Dana Bralec').click(); // 1 meni
  await page.getByRole('menuitem', { name: 'Spremeni vlogo' }).click(); // 2 dejanje
  const dialog = page.getByRole('dialog', { name: 'Spremenim vlogo člana Dana Bralec?' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(page);
  await dialog.getByRole('radio', { name: 'Admin' }).check(); // 3 izbira
  await dialog.getByRole('button', { name: 'Spremeni vlogo' }).click(); // 4 potrditev

  await expect(toast(page)).toContainText('Vloga člana Dana Bralec je spremenjena v Admin.');
  await expect(
    membersSection(page).getByRole('row').filter({ hasText: 'Dana Bralec' }),
  ).toContainText('Admin');
  expect(roleOf(id, viewer.user.email)).toBe('ADMIN');
  await openSettings(viewer.page, id);
  await expect(viewer.page.getByRole('region', { name: 'Povabi člana' })).toBeVisible();
  await expectNoAxeViolations(viewer.page);
  await expectNoHorizontalScroll(page);
  await viewer.context.close();
});

test('FR-007-04: sočasna sprememba vloge – opozorilo kdo in kdaj, Uporabi trenutno različico', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const admin = await otherUser(browser, page, 'Bojan Admin');
  const editor = await otherUser(browser, page, 'Cene Urednik');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, admin.user.email, 'ADMIN');
  addMember(id, editor.user.email, 'EDITOR');
  await openSettings(page, id);
  await openSettings(admin.page, id);
  await openMenuItem(page, 'Cene Urednik', 'Spremeni vlogo');
  await openMenuItem(admin.page, 'Cene Urednik', 'Spremeni vlogo');
  const adminDialog = admin.page.getByRole('dialog', {
    name: 'Spremenim vlogo člana Cene Urednik?',
  });
  await adminDialog.getByRole('radio', { name: 'Bralec' }).check();
  await adminDialog.getByRole('button', { name: 'Spremeni vlogo' }).click();
  await expect(toast(admin.page)).toContainText('spremenjena v Bralec');

  const dialog = page.getByRole('dialog', { name: 'Spremenim vlogo člana Cene Urednik?' });
  await dialog.getByRole('radio', { name: 'Admin' }).check();
  await dialog.getByRole('button', { name: 'Spremeni vlogo' }).click();

  await expect(dialog.getByRole('alert')).toContainText(
    'Vlogo člana je medtem spremenil(a) Bojan Admin ob',
  );
  expect(roleOf(id, editor.user.email)).toBe('VIEWER');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Uporabi trenutno različico' }).click();
  await expect(dialog.getByRole('radio', { name: 'Bralec' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Prekliči' }).click();
  await admin.context.close();
  await editor.context.close();
});

test('FR-007-05 FR-007-11 SC-001: admin odstrani urednika, njegova odprta stran postane »Te strani ni«', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const admin = await otherUser(browser, page, 'Bojan Admin');
  const editor = await otherUser(browser, page, 'Cene Urednik');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, admin.user.email, 'ADMIN');
  addMember(id, editor.user.email, 'EDITOR');
  await editor.page.goto(`/groups/${id}/contacts`);
  await expect(editor.page.getByRole('heading', { level: 1, name: 'Projekt FERI' })).toBeVisible();
  await expectNoAxeViolations(editor.page);
  await openSettings(admin.page, id);

  await openMenuItem(admin.page, 'Cene Urednik', 'Odstrani iz skupine');
  const dialog = admin.page.getByRole('dialog', {
    name: 'Odstranim Cene Urednik iz skupine Projekt FERI?',
  });
  await expect(dialog).toContainText(
    'Cene Urednik ne bo več imel(a) dostopa do kontaktov skupine.',
  );
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(admin.page);
  await dialog.getByRole('button', { name: 'Odstrani člana' }).click();

  await expect(toast(admin.page)).toContainText('Cene Urednik je odstranjen(a) iz skupine.');
  expect(memberExists(id, editor.user.email)).toBe(false);
  await editor.page
    .getByRole('navigation', { name: 'Razdelki skupine' })
    .getByRole('link', { name: 'Nastavitve' })
    .click();
  await expect(editor.page.getByRole('heading', { level: 1, name: 'Te strani ni' })).toBeVisible();
  await expectNoAxeViolations(editor.page);
  await editor.page.goto('/');
  await expect(editor.page.getByRole('heading', { level: 1, name: 'Skupine' })).toBeVisible();
  await expect(editor.page.getByRole('link', { name: /Projekt FERI/ })).toHaveCount(0);
  await expectNoAxeViolations(editor.page);
  await admin.context.close();
  await editor.context.close();
});

test('FR-007-05 F1: lastnik odstrani člana, ki ima odprt dialog spremembe vloge – 404 pokaže »Člana ni več v skupini.«', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const admin = await otherUser(browser, page, 'Bojan Admin');
  const editor = await otherUser(browser, page, 'Cene Urednik');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, admin.user.email, 'ADMIN');
  addMember(id, editor.user.email, 'EDITOR');
  await openSettings(admin.page, id);
  await openMenuItem(admin.page, 'Cene Urednik', 'Spremeni vlogo');
  await openSettings(page, id);
  await openMenuItem(page, 'Cene Urednik', 'Odstrani iz skupine');
  await page
    .getByRole('dialog', { name: 'Odstranim Cene Urednik iz skupine Projekt FERI?' })
    .getByRole('button', { name: 'Odstrani člana' })
    .click();
  await expect(toast(page)).toContainText('Cene Urednik je odstranjen(a) iz skupine.');

  const dialog = admin.page.getByRole('dialog', { name: 'Spremenim vlogo člana Cene Urednik?' });
  await dialog.getByRole('radio', { name: 'Bralec' }).check();
  await dialog.getByRole('button', { name: 'Spremeni vlogo' }).click();

  await expect(
    admin.page.getByRole('alert').filter({ hasText: 'Člana ni več v skupini.' }),
  ).toBeVisible();
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Te strani ni' })).toHaveCount(0);
  await expectNoAxeViolations(admin.page);
  await admin.context.close();
  await editor.context.close();
});

test('FR-007-06 FR-007-07: urednik zapusti skupino, lastnik namesto gumba vidi razlago', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const editor = await otherUser(browser, page, 'Cene Urednik');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, editor.user.email, 'EDITOR');
  await openSettings(page, id);
  await expect(management(page)).toContainText(
    'Kot lastnik lahko skupino zapustiš šele, ko preneseš lastništvo na drugega člana.',
  );
  await expect(management(page).getByRole('button', { name: 'Zapusti skupino' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await openSettings(editor.page, id);

  await management(editor.page).getByRole('button', { name: 'Zapusti skupino' }).click();
  const dialog = editor.page.getByRole('dialog', { name: 'Zapustim skupino Projekt FERI?' });
  await expect(dialog).toContainText(
    'Do kontaktov skupine ne boš imel(a) več dostopa, dokler te znova ne povabijo.',
  );
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(editor.page);
  await dialog.getByRole('button', { name: 'Zapusti skupino' }).click();

  await expect(editor.page).toHaveURL(/\/groups$/);
  await expect(toast(editor.page)).toContainText('Zapustil(a) si skupino Projekt FERI.');
  await expect(editor.page.getByRole('heading', { level: 1, name: 'Skupine' })).toBeVisible();
  expect(memberExists(id, editor.user.email)).toBe(false);
  await expect(editor.page.getByRole('heading', { level: 1, name: 'Skupine' })).toBeVisible();
  await expect(editor.page.getByRole('link', { name: /Projekt FERI/ })).toHaveCount(0);
  await expectNoAxeViolations(editor.page);
  await editor.context.close();
});

test('FR-007-09 FR-007-10: lastnik prenese lastništvo (napačen naslov, nato pravilen), prejšnji lastnik je admin', async ({
  page,
  browser,
}) => {
  const owner = await signedIn(page, 'Ana Novak');
  const heir = await otherUser(browser, page, 'Dana Dedinja');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, heir.user.email, 'VIEWER');
  await openSettings(page, id);

  await management(page).getByRole('button', { name: 'Prenesi lastništvo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Prenesem lastništvo skupine Projekt FERI?' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await dialog
    .getByRole('combobox', { name: 'Novi lastnik' })
    .selectOption({ label: 'Dana Dedinja (Bralec)' });
  await expect(dialog).toContainText('Dana Dedinja bo postal(a) lastnik, ti pa boš admin.');
  const field = dialog.getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' });
  await field.fill('Napačen naslov');
  await dialog.getByRole('button', { name: 'Prenesi lastništvo' }).click();
  await expect(dialog).toContainText('Vpisani naslov se ne ujema z naslovom skupine.');
  expect(roleOf(id, owner.email)).toBe('OWNER');
  await expectNoAxeViolations(page);
  await field.fill('Projekt FERI');
  await dialog.getByRole('button', { name: 'Prenesi lastništvo' }).click();

  await expect(toast(page)).toContainText('Lastništvo je preneseno na Dana Dedinja.');
  expect(roleOf(id, heir.user.email)).toBe('OWNER');
  expect(roleOf(id, owner.email)).toBe('ADMIN');
  await expect(management(page).getByRole('button', { name: 'Prenesi lastništvo' })).toHaveCount(0);
  await openSettings(heir.page, id);
  await expect(heir.page.getByRole('button', { name: 'Arhiviraj skupino' })).toBeVisible();
  await expectNoAxeViolations(heir.page);
  await heir.context.close();
});

test('FR-007-08 FR-007-10: arhivirana skupina brez menijev in prenosa; bralec zapusti; zadnji član trajne skupine ima razlago', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const viewer = await otherUser(browser, page, 'Dana Bralec');
  const last = await otherUser(browser, page, 'Zadnji Član');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, viewer.user.email, 'VIEWER');
  archive(id);
  await openSettings(page, id);
  await expect(page.getByRole('button', { name: /^Dejanja za člana/ })).toHaveCount(0);
  await expect(management(page).getByRole('button', { name: 'Prenesi lastništvo' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await openSettings(viewer.page, id);
  await expectNoAxeViolations(viewer.page);
  await management(viewer.page).getByRole('button', { name: 'Zapusti skupino' }).click();
  await viewer.page
    .getByRole('dialog', { name: 'Zapustim skupino Projekt FERI?' })
    .getByRole('button', { name: 'Zapusti skupino' })
    .click();
  await expect(toast(viewer.page)).toContainText('Zapustil(a) si skupino Projekt FERI.');
  expect(memberExists(id, viewer.user.email)).toBe(false);

  const permanent = await createGroup(page, { title: 'Trajna' });
  addMember(permanent, last.user.email, 'VIEWER');
  makePermanentlyArchived(permanent);
  expect(memberCount(permanent)).toBe(1);
  await openSettings(last.page, permanent);
  await expect(last.page.getByRole('row').filter({ hasText: 'izbrisan uporabnik' })).toContainText(
    'Lastnik',
  );
  await expect(management(last.page)).toContainText(
    'Kot zadnji član skupine je ne moreš zapustiti, lahko jo le izbrišeš.',
  );
  await expect(management(last.page).getByRole('button', { name: 'Zapusti skupino' })).toHaveCount(
    0,
  );
  await expectNoAxeViolations(last.page);
  await viewer.context.close();
  await last.context.close();
});

test('FR-007-12: odstranjen urednik, ki je urejal kontakt, ostane v sledi z imenom; članstvo ne ustvari vnosov', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const editor = await otherUser(browser, page, 'Cene Urednik');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, editor.user.email, 'EDITOR');
  await createContactViaApi(editor.page, id, { firstName: 'Janez', lastName: 'Novak' });
  const entriesBefore = auditCount(id);
  await openSettings(page, id);

  await openMenuItem(page, 'Cene Urednik', 'Odstrani iz skupine');
  await page
    .getByRole('dialog', { name: 'Odstranim Cene Urednik iz skupine Projekt FERI?' })
    .getByRole('button', { name: 'Odstrani člana' })
    .click();
  await expect(toast(page)).toContainText('Cene Urednik je odstranjen(a) iz skupine.');

  expect(auditCount(id)).toBe(entriesBefore);
  await page.goto(`/groups/${id}/audit`);
  await expect(
    page.getByRole('listitem').filter({ hasText: 'dodal(a) kontakt Janez Novak' }),
  ).toContainText('Cene Urednik');
  await expectNoAxeViolations(page);
  await editor.context.close();
});

test('FR-007-01 FR-007-03 SC-006: pri 320 px so tabela, meni in dialogi uporabni s tipkovnico brez vodoravnega drsenja', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const viewer = await otherUser(browser, page, 'Dana Bralec');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  addMember(id, viewer.user.email, 'VIEWER');
  await page.setViewportSize({ width: 320, height: 700 });
  await openSettings(page, id);
  await expectNoHorizontalScroll(page);

  await actionsFor(page, 'Dana Bralec').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Spremeni vlogo' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Spremenim vlogo člana Dana Bralec?' });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(actionsFor(page, 'Dana Bralec')).toBeFocused();
  await viewer.context.close();
});
