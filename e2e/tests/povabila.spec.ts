import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import { archive, createGroup, setRole } from './support/groups';
import {
  anonymizeInviter,
  invitationExists,
  memberRole,
  pendingInvitations,
} from './support/invitations';

// 006 povabila (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px. Dva uporabnika sta prijavljena v
// ločenih kontekstih; vloge, arhiviranje in izbrisanega povabitelja pripravi SQL (D-27).

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

async function otherUser(browser: Browser, page: Page, name: string) {
  const context = await browser.newContext({
    locale: 'sl-SI',
    viewport: page.viewportSize() ?? undefined,
  });
  const other = await context.newPage();
  const user = await signedIn(other, name);
  return { context, page: other, user };
}

const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });
const inviteSection = (page: Page) => page.getByRole('region', { name: 'Povabi člana' });
const pendingSection = (page: Page) => page.getByRole('region', { name: 'Čakajoča povabila' });

/** Pošlje povabilo prek obrazca *Povabi člana* (slovenščina). */
async function sendInvitation(page: Page, email: string, role: 'Admin' | 'Urednik' | 'Bralec') {
  const form = inviteSection(page);
  await form.getByRole('textbox', { name: 'E-naslov' }).fill(email);
  await form.getByRole('radio', { name: role }).check();
  await form.getByRole('button', { name: 'Pošlji povabilo' }).click();
}

test.use({ locale: 'sl-SI' });

test('FR-006-01 FR-006-02 FR-006-03 FR-006-04 FR-006-13 SC-001: lastnik povabi uporabnika, vrstica v čakajočih povabilih, ponovno vabljenje javi napako', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const invitee = await otherUser(browser, page, 'Eva Povabljena');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const started = Date.now();
  await page.goto(`/groups/${id}/settings`);
  await expect(inviteSection(page)).toBeVisible();

  await sendInvitation(page, ` ${invitee.user.email.toUpperCase()} `, 'Urednik');

  await expect(toast(page)).toContainText('Povabilo je poslano.');
  expect(Date.now() - started).toBeLessThan(30_000);
  await expect(inviteSection(page).getByRole('textbox', { name: 'E-naslov' })).toBeFocused();
  const table = pendingSection(page).getByRole('table', { name: 'Čakajoča povabila' });
  await expect(table.getByRole('row').nth(1)).toContainText(invitee.user.email);
  await expect(table.getByRole('row').nth(1)).toContainText('Urednik');
  expect(invitationExists(id, invitee.user.email)).toBe(true);

  await sendInvitation(page, invitee.user.email, 'Bralec');
  await expect(
    inviteSection(page).getByRole('textbox', { name: 'E-naslov' }),
  ).toHaveAccessibleDescription('Ta uporabnik že ima povabilo v to skupino.');
  expect(pendingInvitations(id)).toBe(1);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await invitee.context.close();
});

test('FR-006-05 FR-006-06 FR-006-08 SC-002 SC-005: povabljeni vidi število, sprejme povabilo in odpre skupino', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const invitee = await otherUser(browser, page, 'Eva Povabljena');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/settings`);
  await sendInvitation(page, invitee.user.email, 'Urednik');
  await expect(toast(page)).toContainText('Povabilo je poslano.');

  await invitee.page.goto('/');
  const link = invitee.page.getByRole('link', { name: 'Povabila, 1 novo' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(invitee.page).toHaveURL(/\/invitations$/);
  await expect(invitee.page).toHaveTitle('Povabila – Kontakti');
  await expect(invitee.page.getByRole('heading', { level: 1, name: 'Povabila' })).toBeVisible();
  await expect(invitee.page.getByRole('link', { name: 'Povabila, 1 novo' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const item = invitee.page
    .getByRole('listitem')
    .filter({ has: invitee.page.getByRole('heading', { level: 2, name: 'Projekt FERI' }) });
  await expect(item).toContainText('Povabil(a): Ana Novak');
  await expect(item).toContainText('Vloga: Urednik');
  await expectNoAxeViolations(invitee.page);
  await expectNoHorizontalScroll(invitee.page);

  await invitee.page
    .getByRole('button', { name: 'Sprejmi povabilo v skupino Projekt FERI' })
    .click();

  await expect(toast(invitee.page)).toContainText('Pridružil(a) si se skupini Projekt FERI.');
  await expect(invitee.page.getByRole('link', { name: 'Povabila', exact: true })).toBeVisible();
  await toast(invitee.page).getByRole('link', { name: 'Odpri skupino' }).click();
  await expect(invitee.page).toHaveURL(new RegExp(`/groups/${id}/`));
  await expect(invitee.page.getByRole('heading', { level: 1, name: 'Projekt FERI' })).toBeVisible();
  await expect(invitee.page.getByRole('main')).toContainText('Vloga: Urednik');
  expect(memberRole(id, invitee.user.email)).toBe('EDITOR');
  if (isWide(invitee.page)) {
    await expect(
      invitee.page.getByRole('navigation', { name: 'Moje skupine' }).getByRole('link', {
        name: /Projekt FERI/,
      }),
    ).toBeVisible();
  } else {
    await invitee.page.getByRole('button', { name: 'Preklopi skupino' }).click();
    await expect(
      invitee.page.getByRole('menu', { name: 'Preklopi skupino' }).getByRole('menuitem', {
        name: /Projekt FERI/,
      }),
    ).toBeVisible();
  }
  await invitee.context.close();
});

test('FR-006-10 FR-006-11: zavrnitev z dialogom, povabilo izgine, lastnik ga lahko znova pošlje', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const invitee = await otherUser(browser, page, 'Eva Povabljena');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/settings`);
  await sendInvitation(page, invitee.user.email, 'Bralec');
  await expect(toast(page)).toContainText('Povabilo je poslano.');
  await invitee.page.goto('/invitations');

  await invitee.page
    .getByRole('button', { name: 'Zavrni povabilo v skupino Projekt FERI' })
    .click();
  const dialog = invitee.page.getByRole('dialog', {
    name: 'Zavrnem povabilo v skupino Projekt FERI?',
  });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expectNoAxeViolations(invitee.page);
  await dialog.getByRole('button', { name: 'Zavrni povabilo' }).click();

  await expect(toast(invitee.page)).toContainText('Povabilo je zavrnjeno.');
  await expect(
    invitee.page.getByRole('heading', { level: 2, name: 'Nimaš novih povabil.' }),
  ).toBeVisible();
  expect(memberRole(id, invitee.user.email)).toBeNull();
  expect(pendingInvitations(id)).toBe(0);

  await sendInvitation(page, invitee.user.email, 'Bralec');
  await expect(toast(page)).toContainText('Povabilo je poslano.');
  expect(pendingInvitations(id)).toBe(1);
  await invitee.context.close();
});

test('FR-006-13 FR-006-14 FR-006-15 SC-007: admin ne vidi Umakni za povabilo z vlogo Admin, lastnik ga umakne prek dialoga', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const admin = await otherUser(browser, page, 'Bojan Admin');
  const invitee = await otherUser(browser, page, 'Eva Povabljena');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/settings`);
  await sendInvitation(page, invitee.user.email, 'Admin');
  await expect(toast(page)).toContainText('Povabilo je poslano.');
  setRole(id, admin.user.email, 'ADMIN');

  await admin.page.goto(`/groups/${id}/settings`);
  const adminRow = pendingSection(admin.page).getByRole('row').filter({
    hasText: invitee.user.email,
  });
  await expect(adminRow).toBeVisible();
  await expect(
    admin.page.getByRole('button', { name: `Umakni povabilo za ${invitee.user.email}` }),
  ).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: `Umakni povabilo za ${invitee.user.email}` }).click();
  const dialog = page.getByRole('dialog', { name: `Umaknem povabilo za ${invitee.user.email}?` });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Umakni povabilo' }).click();

  await expect(toast(page)).toContainText('Povabilo je umaknjeno.');
  await expect(pendingSection(page)).toContainText('Ni čakajočih povabil.');
  expect(invitationExists(id, invitee.user.email)).toBe(false);
  await invitee.page.goto('/invitations');
  await expect(
    invitee.page.getByRole('heading', { level: 2, name: 'Nimaš novih povabil.' }),
  ).toBeVisible();
  await admin.context.close();
  await invitee.context.close();
});

test('FR-006-07 FR-006-09 FR-006-13 FR-006-14: arhivirana skupina – brez Povabi člana, s Čakajočimi povabili; povabljeni sprejme in dobi samo branje', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const invitee = await otherUser(browser, page, 'Eva Povabljena');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/settings`);
  await sendInvitation(page, invitee.user.email, 'Urednik');
  await expect(toast(page)).toContainText('Povabilo je poslano.');
  archive(id);

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Podatki skupine' })).toBeVisible();
  await expect(inviteSection(page)).toHaveCount(0);
  await expect(pendingSection(page)).toBeVisible();
  await expect(pendingSection(page)).toContainText(invitee.user.email);

  await invitee.page.goto('/invitations');
  const item = invitee.page
    .getByRole('listitem')
    .filter({ has: invitee.page.getByRole('heading', { level: 2, name: 'Projekt FERI' }) });
  await expect(item).toContainText('Arhivirano');
  await expect(item).toContainText(
    'Skupina je arhivirana – po sprejemu jo boš lahko le pregledoval(a).',
  );
  await expectNoAxeViolations(invitee.page);
  await invitee.page
    .getByRole('button', { name: 'Sprejmi povabilo v skupino Projekt FERI' })
    .click();
  await expect(toast(invitee.page)).toContainText('Pridružil(a) si se skupini Projekt FERI.');

  await invitee.page.goto('/groups/archived');
  await expect(
    invitee.page.getByRole('main').getByRole('link', { name: 'Projekt FERI' }),
  ).toBeVisible();
  await invitee.page.goto(`/groups/${id}/contacts`);
  await expect(invitee.page.getByRole('region', { name: 'Stanje skupine' })).toContainText(
    'Skupina je arhivirana',
  );
  expect(memberRole(id, invitee.user.email)).toBe('EDITOR');
  await invitee.context.close();
});

test('FR-006-07 FR-006-13: izbrisan povabitelj – »izbrisan uporabnik« pri prejetem in čakajočem povabilu', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const invitee = await otherUser(browser, page, 'Eva Povabljena');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/settings`);
  await sendInvitation(page, invitee.user.email, 'Urednik');
  await expect(toast(page)).toContainText('Povabilo je poslano.');

  anonymizeInviter(id, invitee.user.email);

  await invitee.page.goto('/invitations');
  await expect(invitee.page.getByRole('listitem').first()).toContainText(
    'Povabil(a): izbrisan uporabnik',
  );
  await page.reload();
  await expect(pendingSection(page).getByRole('row').nth(1)).toContainText('izbrisan uporabnik');
  await invitee.context.close();
});

test('FR-006-05 FR-006-06 FR-006-13 SC-006: angleški vmesnik – pošiljanje, seznam in axe', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const invitee = await otherUser(browser, page, 'Eva Povabljena');
  const id = await createGroup(page, { title: 'Projekt FERI' });
  await page.goto(`/groups/${id}/settings`);
  await sendInvitation(page, invitee.user.email, 'Urednik');
  await expect(toast(page)).toContainText('Povabilo je poslano.');
  for (const current of [page, invitee.page]) {
    await current.getByRole('button', { name: 'Meni računa' }).click();
    await current.getByRole('menuitemradio', { name: 'English' }).click();
    await current.keyboard.press('Escape');
  }

  await expect(page.getByRole('region', { name: 'Pending invitations' })).toBeVisible();
  await expectNoAxeViolations(page);
  await invitee.page.goto('/');
  await invitee.page.getByRole('link', { name: 'Invitations, 1 new' }).click();
  await expect(invitee.page).toHaveTitle('Invitations – Contacts');
  await expect(invitee.page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
  await expect(
    invitee.page.getByRole('button', { name: 'Accept invitation to Projekt FERI' }),
  ).toBeVisible();
  await expectNoAxeViolations(invitee.page);
  await expectNoHorizontalScroll(invitee.page);
  await invitee.context.close();
});
