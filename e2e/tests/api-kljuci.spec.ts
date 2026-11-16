import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { apiKeyNames, callV1, createApiKey, revokeApiKey, t } from './support/apiKeys';
import { signIn, uniqueUser } from './support/auth';
import { createGroup } from './support/groups';

// 019 API ključi (plan.md – Public Interfaces, quickstart.md). Teče pri 360 in 1280 px. Ključ se ustvari in prekliče v
// razdelku *API ključi* na strani *Moj račun*; programski vmesnik /v1 se kliče z `request` (brez brskalnika).

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
