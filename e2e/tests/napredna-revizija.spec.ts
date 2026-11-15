import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { createContactViaApi } from './support/audit';
import { signIn, type TestUser, uniqueUser } from './support/auth';
import { createGroup, setRole } from './support/groups';
import {
  auditCountByAction,
  contactExists,
  contactPhone,
  deleteContactViaApi,
  editContactViaApi,
} from './support/history';

// 015 napredna revizijska sled (plan.md – Pages and routes): filter po izvajalcu, zgodovina kontakta, primerjava,
// obnova enega kontakta in seznam izbrisanih kontaktov. Vsak test teče pri 360, 768 in 1280 px.

test.use({ locale: 'sl-SI' });

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function signedIn(page: Page, name: string): Promise<TestUser> {
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

const toast = (page: Page) => page.getByRole('region', { name: 'Obvestila' });

test('zgodovina kontakta: časovnica, ogled stanja, primerjava in obnova (urednik)', async ({
  page,
}) => {
  await signedIn(page, 'Ana Novak');
  const groupId = await createGroup(page, { title: 'Zgodovina' });
  const contactId = await createContactViaApi(page, groupId, {
    firstName: 'Janez',
    lastName: 'Novak',
    phone: '01 111 111',
  });
  await editContactViaApi(page, groupId, contactId, {
    phone: '031 999 999',
    attributes: [{ key: 'kompetenca', value: 'web dev' }],
    tags: ['vip'],
  });
  const before = auditCountByAction(groupId, 'RESTORE');

  await page.goto(`/groups/${groupId}/contacts/${contactId}/history`);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Zgodovina kontakta Janez Novak' }),
  ).toBeVisible();
  const events = page.getByRole('list', { name: 'Dogodki zgodovine kontakta' });
  await expect(events.getByRole('listitem')).toHaveCount(2);
  await expectNoAxeViolations(page);

  // Ogled stanja po prvi spremembi (ustvarjanju): telefon je še prvotni.
  await events
    .getByRole('listitem')
    .last()
    .getByRole('link', { name: 'Ogled stanja po tej spremembi' })
    .click();
  await expect(page.getByRole('definition').filter({ hasText: '01 111 111' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Ogled je samo za branje.');
  await page.getByRole('link', { name: 'Nazaj na zgodovino kontakta' }).click();

  // Primerjava s trenutnim stanjem: besedilne oznake vrste spremembe.
  await events
    .getByRole('listitem')
    .last()
    .getByRole('link', { name: 'Primerjaj s trenutno' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Primerjava različic' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Spremenjeno' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Dodano' }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.goto(`/groups/${groupId}/contacts/${contactId}/history`);

  // Obnova: dialog s predogledom, fokus na *Prekliči*, potrditev.
  await events
    .getByRole('listitem')
    .last()
    .getByRole('button', { name: 'Obnovi to različico' })
    .click();
  const dialog = page.getByRole('dialog', { name: /Obnovim kontakt Janez Novak na stanje/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await expect(dialog).toContainText('031 999 999');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Obnovi kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt je obnovljen na stanje');
  expect(contactPhone(contactId)).toBe('01 111 111');
  expect(auditCountByAction(groupId, 'RESTORE')).toBe(before + 1);
  await expect(events.getByRole('listitem')).toHaveCount(3);
});

test('seznam izbrisanih kontaktov: iskanje, obnova in združen kontakt brez gumba Obnovi', async ({
  page,
}) => {
  await signedIn(page, 'Ana Novak');
  const groupId = await createGroup(page, { title: 'Izbrisani' });
  const deleted = await createContactViaApi(page, groupId, {
    firstName: 'Dana',
    lastName: 'Izbrisana',
    phone: '01 222 222',
  });
  const other = await createContactViaApi(page, groupId, {
    firstName: 'Rok',
    lastName: 'Drugi',
    phone: '01 333 333',
  });
  await deleteContactViaApi(page, groupId, deleted);
  await deleteContactViaApi(page, groupId, other);

  await page.goto(`/groups/${groupId}/deleted-contacts`);
  await expect(page.getByRole('heading', { level: 2, name: 'Izbrisani kontakti' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Seznam izbrisanih kontaktov' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expectNoAxeViolations(page);

  await page
    .getByRole('searchbox', { name: 'Iskanje po imenu, e-naslovu ali podjetju' })
    .fill('dana');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Obnovi kontakt Dana Izbrisana' }).click();
  const dialog = page.getByRole('dialog', { name: /Obnovim kontakt Dana Izbrisana/ });
  await expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Obnovi kontakt' }).click();
  await expect(toast(page)).toContainText('Kontakt je obnovljen');
  expect(contactExists(deleted)).toBe(true);
  await expect(page.getByRole('list', { name: 'Seznam izbrisanih kontaktov' })).toHaveCount(0);
});

test('bralec vidi zgodovino, a ne more obnoviti; filter sledi po izvajalcu', async ({
  page,
  browser,
}) => {
  await signedIn(page, 'Ana Novak');
  const groupId = await createGroup(page, { title: 'Pravice' });
  const contactId = await createContactViaApi(page, groupId, {
    firstName: 'Janez',
    lastName: 'Novak',
    phone: '01 111 111',
  });
  const editor = await otherUser(browser, page, 'Bojan Kralj');
  setRole(groupId, editor.user.email, 'EDITOR');
  await editContactViaApi(editor.page, groupId, contactId, { phone: '031 123 456' });
  const viewer = await otherUser(browser, page, 'Cene Bralec');
  setRole(groupId, viewer.user.email, 'VIEWER');

  await viewer.page.goto(`/groups/${groupId}/contacts/${contactId}/history`);
  await expect(
    viewer.page.getByRole('heading', { level: 2, name: 'Zgodovina kontakta Janez Novak' }),
  ).toBeVisible();
  await expect(viewer.page.getByRole('button', { name: 'Obnovi to različico' })).toHaveCount(0);
  await viewer.context.close();

  await page.goto(`/groups/${groupId}/audit`);
  await page.getByRole('button', { name: /^Filtri/ }).click();
  const select = page.getByRole('combobox', { name: 'Izvajalec' });
  const token = await select.getByRole('option', { name: /Bojan/ }).getAttribute('value');
  await select.selectOption(token ?? '');
  await page.getByRole('button', { name: 'Uporabi filtre' }).click();
  await expect(page).toHaveURL(/actor=/);
  const trail = page.getByRole('list', { name: 'Vnosi revizijske sledi' });
  await expect(trail.getByRole('listitem')).toHaveCount(1);
  await expectNoAxeViolations(page);
  await editor.context.close();
});
