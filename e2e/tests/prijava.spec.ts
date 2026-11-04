import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signIn, uniqueUser } from './support/auth';

// 001 prijava (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px (playwright.config.ts).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Atribut elementa <html> (lang, data-theme) – ni element, ki bi ga iskali po vlogi. */
async function htmlAttribute(page: Page, name: string) {
  return page.evaluate((attribute) => document.documentElement.getAttribute(attribute), name);
}

const signInButton = (page: Page) => page.getByRole('button', { name: 'Prijava z Googlom' });

test.use({ locale: 'sl-SI' });

test('FR-001-01 FR-001-02 FR-001-14: nov uporabnik se prijavi z Googlom in ima profil', async ({
  page,
}) => {
  const user = uniqueUser('Ana Novak');
  await page.goto('/');

  await expect(signInButton(page)).toBeVisible();
  expect(page.url()).toContain('/login');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expectNoAxeViolations(page);

  await signIn(page, user);

  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  await page.getByRole('button', { name: 'Meni računa' }).click();
  await page.getByRole('menuitem', { name: 'Moj račun' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(user.name);
  await expect(page.getByRole('main')).toContainText(user.email);
});

test('FR-001-04: zaprto okno za prijavo prikaže sporočilo, ponoven poskus uspe', async ({
  page,
}) => {
  await page.goto('/login');
  const popupOpened = page.waitForEvent('popup');
  await signInButton(page).click();
  const popup = await popupOpened;
  await popup.waitForLoadState();

  await popup.close();

  await expect(page.getByRole('alert')).toHaveText('Prijava je bila prekinjena. Poskusi znova.', {
    timeout: 15_000,
  });
  expect(new URL(page.url()).pathname).toBe('/login');
  await expect(page.getByRole('banner')).toHaveCount(0);

  await signIn(page, uniqueUser());
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
});

test('FR-001-06: zaščitena povezava vodi na prijavo in po prijavi nazaj s parametri', async ({
  page,
}) => {
  await page.goto('/account?x=1');

  await expect(signInButton(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Moj račun' })).toHaveCount(0);

  await signIn(page, uniqueUser());

  await expect(page.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname + url.search).toBe('/account?x=1');
});

test('FR-001-06: ciljna pot na tuj izvor vodi na začetno stran aplikacije', async ({
  page,
  baseURL,
}) => {
  await page.goto('/login?next=%2F%2Fzlonamerno.si');

  await signIn(page, uniqueUser());

  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(new URL(baseURL ?? '').origin);
  expect(new URL(page.url()).pathname).toBe('/');
});

test('FR-001-09: po odjavi Nazaj ali prej obiskana pot ne prikažeta zaščitene vsebine', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, uniqueUser());
  // Zgodovina z zaščitenima vnosoma: / → (meni) /account.
  await page.getByRole('button', { name: 'Meni računa' }).click();
  await page.getByRole('menuitem', { name: 'Moj račun' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();

  await page.getByRole('button', { name: 'Meni računa' }).click();
  await page.getByRole('menuitem', { name: 'Odjava' }).click();

  await expect(signInButton(page)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('next')).toBe('/');
  await expect(signInButton(page)).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);

  await page.goto('/account');
  await expect(signInButton(page)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('next')).toBe('/account');
  await expect(page.getByRole('heading', { name: 'Moj račun' })).toHaveCount(0);
});

test('FR-001-10: odjava v enem zavihku odjavi tudi drugega', async ({ page, context }) => {
  const user = uniqueUser();
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/account');
  await expect(second.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();

  await page.getByRole('button', { name: 'Meni računa' }).click();
  await page.getByRole('menuitem', { name: 'Odjava' }).click();
  await expect(signInButton(page)).toBeVisible();

  await expect(second.getByRole('alert')).toHaveText('Seja je potekla. Prijavi se znova.', {
    timeout: 10_000,
  });
  expect(new URL(second.url()).pathname).toBe('/login');

  await signIn(second, user);
  await expect(second.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();
  expect(new URL(second.url()).pathname).toBe('/account');
});

test('FR-001-11 FR-001-12: ogrodje s tipkovnico – Preskoči na vsebino in meni računa', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, uniqueUser());
  const menuButton = page.getByRole('button', { name: 'Meni računa' });
  await expect(menuButton).toBeVisible();
  await page.reload();
  await expect(menuButton).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Preskoči na vsebino' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await menuButton.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Meni računa' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Moj račun' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: 'Slovenščina' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Moj račun' })).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();

  // Klik drugam zapre meni in vrne fokus na gumb.
  await menuButton.click();
  await expect(menu).toBeVisible();
  const viewport = page.viewportSize() ?? { width: 360, height: 780 };
  await page.mouse.click(viewport.width / 2, viewport.height - 20);
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test('FR-001-13 FR-001-18: neobstoječa pot prikaže »Te strani ni«', async ({ page }) => {
  await page.goto('/ne-obstaja');
  await signIn(page, uniqueUser());

  await expect(page.getByRole('heading', { level: 1, name: 'Te strani ni' })).toBeVisible();
  await expect(page).toHaveTitle('Te strani ni – Kontakti');
  await expect(page.getByRole('link', { name: 'Na seznam skupin' })).toHaveAttribute('href', '/');
  await expectNoAxeViolations(page);
});

test('FR-001-15 FR-001-17 FR-001-19: jezik in tema veljajo po osvežitvi, po odjavi in na drugi napravi', async ({
  page,
  browser,
}) => {
  const user = uniqueUser();
  await page.goto('/account');
  await signIn(page, user);
  await expect(page.getByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();

  await page.getByRole('group', { name: 'Jezik' }).getByRole('radio', { name: 'English' }).check();
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  await page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).check();
  await expect.poll(() => htmlAttribute(page, 'data-theme')).toBe('dark');
  await expect.poll(() => htmlAttribute(page, 'lang')).toBe('en');
  await expect(page).toHaveTitle('My account – Contacts');

  // Brez bliska napačne teme: data-theme je nastavljen že pred izrisom (ob domcontentloaded).
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await htmlAttribute(page, 'data-theme')).toBe('dark');
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect.poll(() => htmlAttribute(page, 'data-theme')).toBe('dark');
  await expect(page).toHaveTitle('Sign in – Contacts');

  const otherDevice = await browser.newContext({ locale: 'sl-SI', colorScheme: 'light' });
  try {
    const other = await otherDevice.newPage();
    await other.goto('/');
    await expect(signInButton(other)).toBeVisible();
    await expect.poll(() => htmlAttribute(other, 'data-theme')).not.toBe('dark');

    await signIn(other, user);

    await expect(other.getByRole('button', { name: 'Account menu' })).toBeVisible();
    await expect.poll(() => htmlAttribute(other, 'lang')).toBe('en');
    await expect.poll(() => htmlAttribute(other, 'data-theme')).toBe('dark');
  } finally {
    await otherDevice.close();
  }
});

test('FR-001-15: jezik na strani za prijavo se zamenja in shrani na napravi', async ({ page }) => {
  await page.goto('/login');
  const languages = page.getByRole('group', { name: 'Jezik' });

  await languages.getByRole('button', { name: 'English' }).click();

  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page).toHaveTitle('Sign in – Contacts');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect.poll(() => htmlAttribute(page, 'lang')).toBe('en');
});

test('FR-001-11: zelo dolgo ime in e-naslov pri 320 px ne povzročita vodoravnega drsenja', async ({
  page,
}) => {
  const user = {
    email: `zelo-dolg-elektronski-naslov-za-preizkus-${Date.now()}@primer-podjetja.si`,
    name: 'Ana Marija Kristina Novak Kovač Horvat Krajnc Zupančič Potočnik',
  };
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/login');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.goto('/account');
  await expect(page.getByRole('main')).toContainText(user.email);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const language of ['sl', 'en'] as const) {
    test(`FR-001-18 SC-006: strani brez kršitev axe (${colorScheme}, ${language})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/login');
      if (language === 'en') {
        await page
          .getByRole('group', { name: 'Jezik' })
          .getByRole('button', { name: 'English' })
          .click();
      }
      const titles =
        language === 'sl'
          ? ['Prijava – Kontakti', 'Moj račun – Kontakti', 'Te strani ni – Kontakti']
          : ['Sign in – Contacts', 'My account – Contacts', 'Page not found – Contacts'];

      await expect(page).toHaveTitle(titles[0] ?? '');
      await expectNoAxeViolations(page);

      await signIn(page, uniqueUser());
      await page.goto('/account');
      await expect(page).toHaveTitle(titles[1] ?? '');
      await expectNoAxeViolations(page);

      await page.goto('/ne-obstaja');
      await expect(page).toHaveTitle(titles[2] ?? '');
      await expectNoAxeViolations(page);
    });
  }
}
