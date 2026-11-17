import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { apiKeyNames, callV1, createApiKey, revokeApiKey, t } from './support/apiKeys';
import { signIn, uniqueUser } from './support/auth';
import { createGroup } from './support/groups';

// 019 API ključi (plan.md – Public Interfaces, quickstart.md). Teče pri 360 in 1280 px. Ključ se ustvari in prekliče v
// razdelku *API ključi* na strani *Moj račun*; programski vmesnik /v1 se kliče z `request` (brez brskalnika).

// Imena iz prevodov so slovenska (t() bere sl.json); brskalnik mora zato zahtevati slovenščino.
test.use({ locale: 'sl-SI', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone });

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

const keyList = (page: Page) =>
  page
    .getByRole('region', { name: apiKeyNames.section() })
    .getByRole('list', { name: t('apiKeys.list') });

test('FR-019-01, -03: ključ se pokaže enkrat, deluje na /v1 in po preklicu dobi 401', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await signIn(page, uniqueUser('Ana Ključ'));
  await createGroup(page, { title: 'Klub' });
  await page.goto('/account');
  await expect(page.getByRole('region', { name: apiKeyNames.section() })).toContainText(
    t('apiKeys.empty'),
  );

  const token = await createApiKey(page, {
    name: 'Nočni izvoz',
    groups: ['Klub'],
    permission: 'READ',
    copy: true,
  });

  const item = keyList(page).getByRole('listitem').filter({ hasText: 'Nočni izvoz' });
  await expect(item).toContainText(t('apiKeys.neverUsed'));
  await expect(item).toContainText(`cmk_…${token.slice(-6)}`);
  await expect(page.getByRole('main')).not.toContainText(token);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  expect((await callV1(request, 'GET', '/groups', token)).status()).toBe(200);

  await revokeApiKey(page, 'Nočni izvoz');

  await expect(item).toContainText(t('apiKeys.status.REVOKED'));
  const revoked = await callV1(request, 'GET', '/groups', token);
  expect(revoked.status()).toBe(401);
  expect(await revoked.json()).toEqual({ code: 'UNAUTHENTICATED' });
  await expectNoAxeViolations(page);
});

test('FR-019-10, -12: ključ WRITE ustvari, spremeni in izbriše kontakt, sled ima tri vnose z oznako ključa', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await signIn(page, uniqueUser('Boris Pisanje'));
  const groupId = await createGroup(page, { title: 'Klub' });
  await page.goto('/account');
  const token = await createApiKey(page, {
    name: 'Nočni izvoz',
    groups: ['Klub'],
    permission: 'WRITE',
  });
  const contacts = `/groups/${groupId}/contacts`;

  const created = await callV1(request, 'POST', contacts, token, {
    firstName: 'Janez',
    lastName: 'Novak',
    phone: '041 123 456',
  });
  expect(created.status()).toBe(201);
  const contact = (await created.json()) as { id: string; version: number; phone: string };
  expect(contact.phone).toBe('+38641123456');

  const updated = await callV1(request, 'PUT', `${contacts}/${contact.id}`, token, {
    firstName: 'Janez',
    lastName: 'Horvat',
    version: contact.version,
  });
  expect(updated.status()).toBe(200);
  const next = ((await updated.json()) as { version: number }).version;

  const stale = await callV1(
    request,
    'DELETE',
    `${contacts}/${contact.id}?version=${contact.version}`,
    token,
  );
  expect(stale.status()).toBe(409);
  // 409 vrne kodo in trenutno stanje vira (contracts – VersionConflict).
  expect(await stale.json()).toMatchObject({
    code: 'VERSION_CONFLICT',
    current: { id: contact.id, version: next },
  });
  const removed = await callV1(
    request,
    'DELETE',
    `${contacts}/${contact.id}?version=${next}`,
    token,
  );
  expect(removed.status()).toBe(204);

  await page.goto(`/groups/${groupId}/audit`);
  const entries = page.getByRole('list', { name: t('audit.list.entries') }).getByRole('listitem');
  // Tri vnosi sledi + zadnji element seznama »Začetno stanje« (brez filtrov na zadnji strani).
  await expect(entries).toHaveCount(4);
  await expect(entries.last()).toContainText(t('audit.initial.heading'));
  const label = t('audit.source.viaApiKey', { name: 'Nočni izvoz' });
  for (let i = 0; i < 3; i++) {
    await expect(entries.nth(i)).toContainText(label);
  }
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test('FR-019-14, -15: neprijavljen odpre stran API s prijave, prenese opis, kopira primer', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/login');
  await page.getByRole('link', { name: t('login.apiDocsLink') }).click();

  await expect(page).toHaveURL(/\/api-docs$/);
  await expect(page.getByRole('heading', { level: 1, name: t('apiDocs.heading') })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(t('apiDocs.security.noCors'));
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: t('apiDocs.download') }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const description = JSON.parse(readFileSync(path, 'utf-8')) as {
    openapi: string;
    paths: Record<string, unknown>;
  };
  expect(description.openapi).toMatch(/^3\.1/);
  expect(Object.keys(description.paths)).toContain('/v1/groups');

  // Tipkovnica: gumb Kopiraj je dosegljiv s Tab in deluje z Enter.
  const copy = page.getByRole('button', {
    name: t('apiDocs.copyExample', {
      name: `${t('apiDocs.examples.listGroups')} – ${t('apiDocs.examples.request')}`,
    }),
  });
  await page.keyboard.press('Tab');
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(t('apiDocs.copied')).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/v1/groups');
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);
});

test('FR-019-20: zahteve s ključem se vidijo v statistiki (tabela) in na seznamu', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await signIn(page, uniqueUser('Ana Statistika'));
  await createGroup(page, { title: 'Klub' });
  await page.goto('/account');
  const token = await createApiKey(page, {
    name: 'Nočni izvoz',
    groups: ['Klub'],
    permission: 'READ',
  });
  for (let i = 0; i < 3; i += 1) {
    expect((await callV1(request, 'GET', '/groups', token)).status()).toBe(200);
  }
  expect(
    (
      await callV1(request, 'GET', '/groups/0193c4a2-7a1f-7c3e-9b1a-000000000000/contacts', token)
    ).status(),
  ).toBe(404);
  expect((await callV1(request, 'GET', '/groups', 'cmk_ni-zeton')).status()).toBe(401);

  await page.reload();
  const item = keyList(page).getByRole('listitem').filter({ hasText: 'Nočni izvoz' });
  await expect(item).toContainText(t('apiKeys.requests24h_few', { count: '4' }));
  await item.getByRole('link', { name: t('apiKeys.usageLink', { name: 'Nočni izvoz' }) }).click();

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: t('apiKeys.usage.heading', { name: 'Nočni izvoz' }),
    }),
  ).toBeVisible();
  const totals = page.getByRole('region', { name: t('apiKeys.usage.totals') });
  await expect(totals).toContainText(`${t('apiKeys.usage.total')}4`);
  await expect(totals).toContainText(`${t('apiKeys.usage.successful')}3`);
  await expect(totals).toContainText(`${t('apiKeys.usage.errors')}1`);
  const table = page.getByRole('table', { name: t('apiKeys.usage.tableCaption') });
  await expect(table.getByRole('row')).toHaveCount(8);
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);

  await page.getByRole('radio', { name: t('apiKeys.usage.period30') }).check();
  await expect(table.getByRole('row')).toHaveCount(31);
  await expectNoAxeViolations(page);

  await page.goto('/account/api-keys/0193c4a2-7a1f-7c3e-9b1a-000000000000');
  await expect(page.getByRole('heading', { name: t('notFound.heading') })).toBeVisible();
});
