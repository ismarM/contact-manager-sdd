import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signIn, uniqueUser } from './support/auth';
import { createGroup } from './support/groups';
import {
  goToAccount,
  goToArchived,
  goToInvitations,
  isPhoneViewport,
  isWideViewport,
  mainNavigation,
  openGroup,
  openGroupSwitcher,
} from './support/nav';

// Začasna začetna stran ogrodja (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px
// (projekti v playwright.config.ts) ter v svetli in temni shemi sistema.

const LIGHT_BG = 'rgb(247, 246, 242)'; // --k-bg svetla (#F7F6F2, design.md v2)
const DARK_BG = 'rgb(18, 18, 17)'; // --k-bg temna (#121211, design.md v2)

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`shema ${colorScheme}`, () => {
    test.use({ colorScheme, locale: 'sl-SI' });

    test('FR-000-01: zahtevek z začetne strani doseže backend', async ({ page }) => {
      await page.goto('/');
      const response = await page.request.get('/api/health');

      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ status: 'UP' });
    });

    test('FR-000-12: začetna stran brez kršitev axe', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test('FR-000-12: vsi viri so naloženi z istega izvora', async ({ page, baseURL }) => {
      const origins = new Set<string>();
      const fonts: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        origins.add(url.origin);
        if (url.pathname.endsWith('.woff2')) fonts.push(url.pathname);
      });

      await page.goto('/', { waitUntil: 'networkidle' });

      expect([...origins]).toEqual([new URL(baseURL ?? '').origin]);
      expect(fonts.length).toBeGreaterThan(0);
    });

    test('FR-000-12: brez vodoravnega drsenja pri 320 px', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('FR-000-13: shema sledi sistemu, data-theme jo preglasi', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();
      const bodyBackground = () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      expect(await bodyBackground()).toBe(colorScheme === 'dark' ? DARK_BG : LIGHT_BG);

      const override = colorScheme === 'dark' ? 'light' : 'dark';
      await page.evaluate((theme) => localStorage.setItem('theme', theme), override);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();

      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(override);
      expect(await bodyBackground()).toBe(override === 'dark' ? DARK_BG : LIGHT_BG);
    });

    test('FR-000-15: aplikacija je namestljiva', async ({ page }) => {
      await page.goto('/');
      const response = await page.request.get('/manifest.webmanifest');
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/manifest\+json|application\/json/);
      const manifest = (await response.json()) as {
        name: string;
        display: string;
        background_color: string;
        theme_color: string;
        icons: { sizes: string; purpose?: string }[];
      };

      expect(manifest.name).toBe('Kontakti');
      expect(manifest.display).toBe('standalone');
      expect(manifest.background_color.toUpperCase()).toBe('#F6F5F1');
      expect(manifest.theme_color.toUpperCase()).toBe('#1F4E8C');
      const sizes = manifest.icons.map((icon) => icon.sizes);
      expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
      expect(manifest.icons.some((icon) => icon.purpose?.includes('maskable'))).toBe(true);

      const ready = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return registration.active !== null;
      });
      expect(ready).toBe(true);
    });

    test('FR-000-15: brez povezave se naloži ogrodje, API pa ne', async ({ page, context }) => {
      await page.goto('/');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();

      await context.setOffline(true);
      await page.reload();

      await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();
      const apiReachable = await page.evaluate(() =>
        fetch('/api/health').then(
          () => true,
          () => false,
        ),
      );
      expect(apiReachable).toBe(false);
    });
  });
}

test.describe('zmanjšano gibanje in vsiljene barve', () => {
  test.use({ locale: 'sl-SI', reducedMotion: 'reduce', forcedColors: 'active' });

  test('FR-000-13: ob prefers-reduced-motion ni prehodov ali animacij', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();

    const moving = await page.evaluate(
      () =>
        [...document.querySelectorAll('*')].filter((element) => {
          const style = getComputedStyle(element);
          const seconds = (value: string) =>
            Math.max(...value.split(',').map((part) => parseFloat(part) || 0));
          return seconds(style.transitionDuration) > 0 || seconds(style.animationDuration) > 0;
        }).length,
    );
    expect(moving).toBe(0);
  });

  test('FR-000-13: v načinu vsiljenih barv je stran berljiva in brez kršitev axe', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('jezik brskalnika', () => {
  test.describe('slovenščina', () => {
    test.use({ locale: 'sl-SI' });

    test('FR-000-14: sl-SI → slovenska besedila in lang="sl"', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByRole('heading', { level: 1, name: 'Prijava' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('sl');
    });
  });

  test.describe('nemščina', () => {
    test.use({ locale: 'de-DE' });

    test('FR-000-14: de-DE → angleška besedila in lang="en"', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    });
  });
});

// 020 – novo ogrodje in navigacija (FR-020-05 … -09). Teče pri 360 (spodnja vrstica), 768 (ploskev) in 1280 px
// (stranska vrstica); vsebuje tudi @w768, da se izvede v srednjem projektu.

async function signedIn(page: Page) {
  const user = uniqueUser('Ana Novak');
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  return user;
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('ogrodje in navigacija', () => {
  test.use({ locale: 'sl-SI' });

  test('FR-020-05 FR-020-07 @w768: vsi cilji dosegljivi prek glavne navigacije, aktivna postavka je označena', async ({
    page,
  }) => {
    await signedIn(page);

    await goToArchived(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Arhivirane skupine' })).toBeVisible();
    await goToInvitations(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Povabila' })).toBeVisible();
    await goToAccount(page);

    const nav = await mainNavigation(page);
    await nav.getByRole('link', { name: 'Skupine', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Skupine' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('FR-020-07: pod 640 px je spodnja vrstica s točno štirimi postavkami, sicer je ni', async ({
    page,
  }) => {
    await signedIn(page);
    const bar = page.getByRole('navigation', { name: 'Glavna navigacija' });

    if (isPhoneViewport(page)) {
      await expect(bar.getByRole('link')).toHaveCount(4);
      await expect(bar.getByRole('link', { name: 'Skupine' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await bar.getByRole('link', { name: 'Račun' }).click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(bar.getByRole('link', { name: 'Račun' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    } else {
      await expect(bar).toHaveCount(isWideViewport(page) ? 1 : 0);
    }
  });

  test('FR-020-05 FR-020-07: od 1024 px stalna stranska vrstica, pod tem ploskev z gumbom v zgornji vrstici', async ({
    page,
  }) => {
    await signedIn(page);

    if (isWideViewport(page)) {
      await expect(page.getByRole('banner')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Arhivirane', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('banner')).toBeVisible();
      if (!isPhoneViewport(page)) {
        await page.getByRole('button', { name: 'Odpri navigacijo' }).click();
        await expect(page.getByRole('dialog', { name: 'Navigacija' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    }
  });

  test('FR-020-09: stikala teme v glavi ali navigaciji ni, tema je v Mojem računu', async ({
    page,
  }) => {
    await signedIn(page);

    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /tema/i })).toHaveCount(0);
    await goToAccount(page);
    await expect(page.getByRole('main').getByText('Tema', { exact: true })).toBeVisible();
  });

  test('FR-020-06 FR-020-08: zamenjava skupine prek preklopnika ohrani zavihek, glava kaže naziv in vlogo', async ({
    page,
  }) => {
    await signedIn(page);
    await createGroup(page, { title: 'Alfa' });
    await createGroup(page, { title: 'Beta' });
    await openGroup(page, 'Alfa');
    await page
      .getByRole('navigation', { name: 'Razdelki skupine' })
      .getByRole('link', { name: 'Revizijska sled' })
      .click();
    await expect(page).toHaveURL(/\/audit$/);

    await expect(page.getByRole('heading', { level: 1, name: 'Alfa' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Alfa' })).toContainText('Vloga: Lastnik');
    const menu = await openGroupSwitcher(page);
    await expectNoAxeViolations(page);
    await menu.getByRole('menuitem', { name: 'Beta', exact: true }).click();

    await expect(page).toHaveURL(/\/audit$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Beta' })).toBeVisible();
    if (isWideViewport(page)) {
      // Vidni naziv kartice je ob gumbu (WCAG 2.5.3); gumb ga ima kot opis.
      await expect(
        page.getByRole('button', { name: 'Preklopi skupino' }),
      ).toHaveAccessibleDescription('Beta');
    }
  });

  test('FR-020-05: tipkovnica – prvi Tab je »Preskoči na vsebino«, navigacija je dosegljiva s tipkovnico', async ({
    page,
  }) => {
    await signedIn(page);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Preskoči na vsebino' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });
});
