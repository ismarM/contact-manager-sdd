import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signIn, uniqueUser } from './support/auth';
import { archive, createGroup, createGroupsBulk } from './support/groups';

// 017 iskanje in filtriranje skupin (plan.md – Pages and routes: `/`, stanje v URL `q`, `role`, `state`). Skupine in
// arhiviranje pripravi SQL (D-27); vsak test teče pri 360 in 1280 px (playwright.config.ts).

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

test.use({ locale: 'sl-SI' });

test('FR-017-14 FR-017-15 FR-017-16 FR-017-17: iskanje, filter vlog, arhivirane, prazno stanje in obstojnost v URL', async ({
  page,
}) => {
  const user = uniqueUser('Ana Novak');
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: /^(Meni računa|Account menu)$/ })).toBeVisible();
  const archivedId = await createGroup(page, { title: 'Šolski krožek' });
  archive(archivedId);
  createGroupsBulk(user.email, 60, 'OWNER');
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('navigation', { name: 'Strani rezultatov: Skupine' })).toContainText(
    '1–25 od 60',
  );

  // Skupina s tretje strani razdelka se najde z iskanjem po delu naziva.
  const search = main.getByRole('searchbox', { name: 'Išči skupine' });
  await search.fill('skupina 058');
  await expect(main.getByRole('link', { name: 'Skupina 058' })).toBeVisible();
  await expect(main.getByRole('status').filter({ hasText: '1 zadetek' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=skupina\+058|[?&]q=skupina%20058/);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Osvežitev ohrani iskanje.
  await page.reload();
  await expect(main.getByRole('searchbox', { name: 'Išči skupine' })).toHaveValue('skupina 058');
  await expect(main.getByRole('link', { name: 'Skupina 058' })).toBeVisible();

  // Filter vlog brez zadetkov: prazno stanje, Počisti iskanje vrne vse.
  // Stanje je v URL (react-router ga posodobi asinhrono), zato click + expect namesto check().
  const viewer = main
    .getByRole('group', { name: 'Vloga' })
    .getByRole('checkbox', { name: 'Bralec' });
  await viewer.click();
  await expect(viewer).toBeChecked();
  await expect(main.getByRole('heading', { level: 2, name: 'Ni zadetkov.' })).toBeVisible();
  await expectNoAxeViolations(page);
  await main.getByRole('link', { name: 'Počisti iskanje' }).click();
  await expect(main.getByRole('navigation', { name: 'Strani rezultatov: Skupine' })).toContainText(
    '1–25 od 60',
  );
  await expect(main.getByRole('searchbox', { name: 'Išči skupine' })).toHaveValue('');

  // Stanje Arhivirane: ista iskalna polja (brez razlike šumnikov), povezava na stran Arhivirane skupine ostane.
  const archivedState = main.getByRole('radio', { name: 'Arhivirane' });
  await archivedState.click();
  await expect(archivedState).toBeChecked();
  await expect(main.getByRole('link', { name: 'Šolski krožek' })).toBeVisible();
  await main.getByRole('searchbox', { name: 'Išči skupine' }).fill('SOLSKI');
  await expect(main.getByRole('link', { name: 'Šolski krožek' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Arhivirane skupine' })).toBeVisible();
  await expect(page).toHaveURL(/state=archived/);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await main.getByRole('searchbox', { name: 'Išči skupine' }).fill('nicneobstaja');
  await expect(main.getByRole('heading', { level: 2, name: 'Ni zadetkov.' })).toBeVisible();
});
