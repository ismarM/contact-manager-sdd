import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Začasna začetna stran ogrodja (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px
// (projekti v playwright.config.ts) ter v svetli in temni shemi sistema.

const LIGHT_BG = 'rgb(246, 245, 241)'; // --k-bg svetla (#F6F5F1)
const DARK_BG = 'rgb(22, 21, 19)'; // --k-bg temna (#161513)

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
      await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();

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
      await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('FR-000-13: shema sledi sistemu, data-theme jo preglasi', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();
      const bodyBackground = () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      expect(await bodyBackground()).toBe(colorScheme === 'dark' ? DARK_BG : LIGHT_BG);

      const override = colorScheme === 'dark' ? 'light' : 'dark';
      await page.evaluate((theme) => localStorage.setItem('theme', theme), override);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();

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
      await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();

      await context.setOffline(true);
      await page.reload();

      await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();

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
    await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();

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

      await expect(page.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('sl');
    });
  });

  test.describe('nemščina', () => {
    test.use({ locale: 'de-DE' });

    test('FR-000-14: de-DE → angleška besedila in lang="en"', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    });
  });
});
