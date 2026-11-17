import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signIn, uniqueUser } from './support/auth';
import { createContactsBulk } from './support/contacts';
import { createGroup } from './support/groups';

// 020 Prenova vmesnika, US1 (FR-020-01 … -04): ključni zasloni v svetli in temni temi, v načinu vsiljenih barv in pri
// zmanjšanem gibanju, pri 360 in 1280 px (playwright.config.ts); axe brez kršitev in brez vodoravnega drsenja.
// Čas do interaktivnosti (SC-007) je informativen: zapiše se kot opomba testa, brez meje.

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

/** Prijavljen uporabnik z eno skupino s kontakti; vrne id skupine. */
async function seed(page: Page): Promise<string> {
  const user = uniqueUser('Ana Novak');
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  const groupId = await createGroup(page, { title: 'Projekt FERI' });
  createContactsBulk(groupId, 12);
  return groupId;
}

async function screens(page: Page, groupId: string) {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Projekt FERI' }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.goto(`/groups/${groupId}/contacts`);
  await expect(page.getByRole('heading', { level: 1, name: 'Projekt FERI' })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`FR-020-01 FR-020-02: prijava in ključni zasloni v ${colorScheme} temi nimajo kršitev axe`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Nadaljuj z Googlom' })).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);

    const groupId = await seed(page);
    await screens(page, groupId);
  });
}

test('FR-020-03: pri zmanjšanem gibanju dialog nima animacije', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await page.goto('/');

  await page.getByRole('main').getByRole('button', { name: 'Nova skupina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova skupina' });
  await expect(dialog).toBeVisible();

  const duration = await dialog.evaluate((element) => getComputedStyle(element).animationDuration);
  expect(duration).toBe('0s');
  await expectNoAxeViolations(page);
});

test('FR-020-04: v načinu vsiljenih barv sta fokus in rob polja vidna', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const groupId = await seed(page);
  await page.goto(`/groups/${groupId}/contacts`);
  await expect(page.getByRole('heading', { level: 1, name: 'Projekt FERI' })).toBeVisible();

  await page.keyboard.press('Tab');
  const focused = page.locator(':focus-visible').first();
  await expect(focused).toBeVisible();
  const outline = await focused.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).toBe('solid');
  expect(outline.width).toBe('2px');
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test('SC-007: čas do interaktivnosti zaslona Skupine (informativno)', async ({ page }) => {
  await seed(page);
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Projekt FERI' }).first()).toBeVisible();
  const elapsed = Date.now() - started;

  test.info().annotations.push({ type: 'TTI', description: `${elapsed} ms` });
  expect(elapsed).toBeGreaterThan(0);
});
