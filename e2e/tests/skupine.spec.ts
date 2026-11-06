import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { signIn, type TestUser, uniqueUser } from './support/auth';
import { archive, createGroup, createGroupsBulk, setRole } from './support/groups';

// 002 skupine (plan.md – Public Interfaces). Vsak test teče pri 360, 768 in 1280 px (playwright.config.ts); stranski
// pas je viden od 1024 px, pod tem gumb »Preklopi skupino«. Vloge in arhiviranje pripravi SQL v bazi (D-27).

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

const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function signedIn(page: Page, name = 'Ana Novak'): Promise<TestUser> {
  const user = uniqueUser(name);
  await page.goto('/');
  await signIn(page, user);
  await expect(page.getByRole('button', { name: 'Meni računa' })).toBeVisible();
  return user;
}

/** Drug uporabnik v svojem kontekstu brskalnika (enaka širina in jezik). */
async function otherUser(browser: Browser, page: Page, name: string) {
  const context = await browser.newContext({
    locale: 'sl-SI',
    viewport: page.viewportSize() ?? undefined,
  });
  const other = await context.newPage();
  const user = await signedIn(other, name);
  return { context, page: other, user };
}

/** Zamenja jezik prek menija računa (001, FR-001-12). */
async function switchLanguage(page: Page, language: 'sl' | 'en') {
  await page.getByRole('button', { name: /^(Meni računa|Account menu)$/ }).click();
  await page
    .getByRole('menuitemradio', { name: language === 'en' ? 'English' : 'Slovenščina' })
    .click();
  await page.keyboard.press('Escape');
}

/** Seznam skupin: stranski pas pri ≥ 1024 px, sicer meni »Preklopi skupino« (odprt). */
async function groupNavigation(page: Page) {
  if (isWide(page)) return page.getByRole('navigation', { name: 'Moje skupine' });
  await page.getByRole('button', { name: 'Preklopi skupino' }).click();
  return page.getByRole('menu', { name: 'Preklopi skupino' });
}

test.use({ locale: 'sl-SI' });

test('FR-002-01 FR-002-03 FR-002-05 FR-002-07: nov uporabnik ustvari prvo skupino in postane lastnik', async ({
  page,
}) => {
  await signedIn(page);
  const main = page.getByRole('main');

  await expect(
    main.getByRole('heading', { level: 2, name: 'Nimaš še nobene skupine.' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await main.getByRole('button', { name: 'Nova skupina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova skupina' });
  await expect(dialog.getByRole('textbox', { name: 'Naslov' })).toBeFocused();
  await expectNoAxeViolations(page);
  await dialog.getByRole('textbox', { name: 'Naslov' }).fill('Projekt FERI');
  await dialog.getByRole('radio', { name: 'Mah' }).check();
  await dialog.getByRole('button', { name: 'Ustvari skupino' }).click();

  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}\/settings$/);
  const header = page.getByRole('region', { name: 'Projekt FERI' });
  await expect(header.getByRole('heading', { level: 1, name: 'Projekt FERI' })).toBeFocused();
  await expect(header).toContainText('Lastnik');
  await expect(
    page.getByRole('region', { name: 'Obvestila' }).getByText('Skupina je ustvarjena.'),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-002-02: prazen naslov – napaka ob polju, dialog ostane odprt', async ({ page }) => {
  await signedIn(page);
  await page.getByRole('main').getByRole('button', { name: 'Nova skupina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova skupina' });

  await dialog.getByRole('button', { name: 'Ustvari skupino' }).click();

  const title = dialog.getByRole('textbox', { name: 'Naslov' });
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveAccessibleDescription('Vpiši naslov.');
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
});

test('FR-002-06: stranski pas (≥ 1024 px) ali meni preklopa (< 1024 px) prikaže skupine in odpre drugo', async ({
  page,
}) => {
  await signedIn(page);
  const first = await createGroup(page, { title: 'Alfa' });
  const second = await createGroup(page, { title: 'Beta' });
  await page.goto(`/groups/${first}/settings`);

  const groups = await groupNavigation(page);
  const current = isWide(page)
    ? groups.getByRole('link', { name: 'Alfa' })
    : groups.getByRole('menuitem', { name: 'Alfa' });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await expect(
    groups
      .getByRole('heading', { name: 'Lastnik' })
      .or(groups.getByRole('group', { name: 'Lastnik' })),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await (
    isWide(page)
      ? groups.getByRole('link', { name: 'Beta' })
      : groups.getByRole('menuitem', { name: 'Beta' })
  ).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${second}/settings$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Beta' })).toBeVisible();
  if (!isWide(page)) {
    await expect(page.getByRole('navigation', { name: 'Moje skupine' })).toHaveCount(0);
  }
});

test('FR-002-04 FR-002-07 FR-002-08 FR-002-10: razdelki po vlogah, arhivirana skupina in tuja skupina', async ({
  page,
  browser,
}) => {
  const ana = await signedIn(page);
  await createGroup(page, { title: 'Moja' });
  const bojan = await otherUser(browser, page, 'Bojan Kos');
  const asAdmin = await createGroup(bojan.page, { title: 'Cvet' });
  const asViewer = await createGroup(bojan.page, { title: 'Delta' });
  const archived = await createGroup(bojan.page, { title: 'Stara' });

  // Tuja skupina: »Te strani ni«, brez podatkov skupine.
  await page.goto(`/groups/${asAdmin}/settings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Te strani ni' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Cvet');
  await expectNoAxeViolations(page);

  setRole(asAdmin, ana.email, 'ADMIN');
  setRole(asViewer, ana.email, 'VIEWER');
  setRole(archived, ana.email, 'ADMIN');
  archive(archived);
  await page.goto('/');
  const main = page.getByRole('main');

  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    'Lastnik (1)',
    'Admin (1)',
    'Bralec (1)',
  ]);
  await expect(main.getByRole('link', { name: 'Stara' })).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.goto(`/groups/${archived}/settings`);
  const header = page.getByRole('region', { name: 'Stara' });
  await expect(header).toContainText('Arhivirano');
  await expect(page.getByRole('form', { name: 'Podatki skupine' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await switchLanguage(page, 'en');
  await expect(header).toContainText('Archived');
  await expectNoAxeViolations(page);
  await switchLanguage(page, 'sl');

  await page.goto(`/groups/${asViewer}/settings`);
  await expect(page.getByRole('heading', { level: 2, name: 'Podatki skupine' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Podatki skupine' })).toHaveCount(0);
  await expect(page.getByRole('definition').filter({ hasText: 'Tinta' })).toBeVisible();
  await expectNoAxeViolations(page);
  await switchLanguage(page, 'en');
  await expect(page.getByRole('heading', { level: 2, name: 'Group details' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Ink' })).toBeVisible();
  await expectNoAxeViolations(page);
  await bojan.context.close();
});

test('FR-002-09 FR-002-11: admin spremeni naslov in barvo – glava, seznam in naslov strani', async ({
  page,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Projekt FERI' });
  const form = page.getByRole('form', { name: 'Podatki skupine' });
  await expect(page).toHaveTitle('Nastavitve – Projekt FERI – Kontakti');
  await expectNoAxeViolations(page);

  await form.getByRole('textbox', { name: 'Naslov' }).fill('Projekt FERI 2');
  await form.getByRole('radio', { name: 'Rja' }).check();
  await form.getByRole('button', { name: 'Shrani spremembe' }).click();

  await expect(
    page.getByRole('region', { name: 'Obvestila' }).getByText('Podatki skupine so shranjeni.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Projekt FERI 2' })).toBeVisible();
  await expect(page).toHaveTitle('Nastavitve – Projekt FERI 2 – Kontakti');
  const groups = await groupNavigation(page);
  await expect(
    isWide(page)
      ? groups.getByRole('link', { name: 'Projekt FERI 2' })
      : groups.getByRole('menuitem', { name: 'Projekt FERI 2' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/');
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Projekt FERI 2' }),
  ).toHaveAttribute('href', `/groups/${id}`);
});

test('FR-002-12: sočasna sprememba – opozorilo o konfliktu, razlike in »Shrani moje spremembe«', async ({
  page,
  browser,
}) => {
  await signedIn(page);
  const id = await createGroup(page, { title: 'Skupna' });
  const bojan = await otherUser(browser, page, 'Bojan Kos');
  setRole(id, bojan.user.email, 'ADMIN');
  await bojan.page.goto(`/groups/${id}/settings`);
  const ownerForm = page.getByRole('form', { name: 'Podatki skupine' });
  const adminForm = bojan.page.getByRole('form', { name: 'Podatki skupine' });
  await expect(adminForm.getByRole('textbox', { name: 'Naslov' })).toHaveValue('Skupna');

  await ownerForm.getByRole('textbox', { name: 'Naslov' }).fill('Lastnikov naslov');
  await ownerForm.getByRole('button', { name: 'Shrani spremembe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lastnikov naslov' })).toBeVisible();
  await adminForm.getByRole('textbox', { name: 'Naslov' }).fill('Adminov naslov');
  await adminForm.getByRole('button', { name: 'Shrani spremembe' }).click();

  const alert = bojan.page.getByRole('alert');
  await expect(alert).toContainText('Skupino je medtem spremenil(a) Ana Novak ob');
  await expect(adminForm.getByRole('textbox', { name: 'Naslov' })).toHaveValue('Adminov naslov');
  await alert.getByRole('button', { name: 'Prikaži razlike' }).click();
  const table = bojan.page.getByRole('table', {
    name: 'Razlike med tvojimi in trenutnimi vrednostmi',
  });
  await expect(table.getByRole('row').nth(1)).toContainText('Adminov naslov');
  await expect(table.getByRole('row').nth(1)).toContainText('Lastnikov naslov');
  await expectNoAxeViolations(bojan.page);
  await switchLanguage(bojan.page, 'en');
  await expect(
    bojan.page.getByRole('table', {
      name: 'Differences between your values and the current ones',
    }),
  ).toBeVisible();
  await expect(alert).toContainText('The group was changed in the meantime by Ana Novak at');
  await expectNoAxeViolations(bojan.page);
  await alert.getByRole('button', { name: 'Save my changes' }).click();

  await expect(bojan.page.getByRole('heading', { level: 1, name: 'Adminov naslov' })).toBeVisible();
  await expect(bojan.page.getByRole('alert')).toHaveCount(0);
  await bojan.context.close();
});

test('FR-002-13: zaledje ni dosegljivo ob ustvarjanju – sporočilo brez kod, vnosi ostanejo', async ({
  page,
}) => {
  await signedIn(page);
  await page.route('**/api/groups', (route) =>
    route.request().method() === 'POST' ? route.abort('connectionrefused') : route.fallback(),
  );
  await page.getByRole('main').getByRole('button', { name: 'Nova skupina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova skupina' });
  await dialog.getByRole('textbox', { name: 'Naslov' }).fill('Brez povezave');

  await dialog.getByRole('button', { name: 'Ustvari skupino' }).click();

  const alert = dialog.getByRole('alert');
  await expect(alert).toHaveText('Ni povezave. Preveri povezavo in poskusi znova.');
  await expect(alert).not.toContainText(/[A-Z_]{6,}|\b[45]\d\d\b/);
  await expect(dialog.getByRole('textbox', { name: 'Naslov' })).toHaveValue('Brez povezave');
  await expectNoAxeViolations(page);
});

test('FR-002-09 SC-006: naslovi strani in axe v slovenščini in angleščini', async ({ page }) => {
  await signedIn(page);
  await expect(page).toHaveTitle('Skupine – Kontakti');
  await switchLanguage(page, 'en');
  const main = page.getByRole('main');
  await expect(
    main.getByRole('heading', { level: 2, name: "You don't have any groups yet." }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await main.getByRole('button', { name: 'New group' }).click();
  const empty = page.getByRole('dialog', { name: 'New group' });
  await empty.getByRole('button', { name: 'Create group' }).click();
  await expect(empty.getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription(
    'Enter a title.',
  );
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await switchLanguage(page, 'sl');
  await createGroup(page, { title: 'Dvojezična' });
  await expect(page).toHaveTitle('Nastavitve – Dvojezična – Kontakti');

  await switchLanguage(page, 'en');

  await expect(page).toHaveTitle('Settings – Dvojezična – Contacts');
  await expect(page.getByRole('region', { name: 'Dvojezična' })).toContainText('Owner');
  await expectNoAxeViolations(page);
  const form = page.getByRole('form', { name: 'Group details' });
  await form.getByRole('textbox', { name: 'Title' }).fill('');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expectNoAxeViolations(page);

  await page.goto('/');
  await expect(page).toHaveTitle('Groups – Contacts');
  await expect(
    page.getByRole('main').getByRole('heading', { level: 2, name: 'Owner (1)' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('main').getByRole('button', { name: 'New group' }).click();
  await expect(page.getByRole('dialog', { name: 'New group' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  if (!isWide(page)) {
    await page.getByRole('button', { name: 'Switch group' }).click();
    await expect(page.getByRole('menu', { name: 'Switch group' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
  }

  await page.goto(`/groups/00000000-0000-0000-0000-000000000000/settings`);
  await expect(page).toHaveTitle('Page not found – Contacts');
  await expectNoAxeViolations(page);
});

test('FR-002-07 FR-002-04: 320 px z dolgim naslovom in opisom brez vodoravnega drsenja', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signedIn(page);
  const title = 'Zelo dolg naslov skupine '.repeat(4).slice(0, 100);
  await createGroup(page, { title, description: 'Dolg opis '.repeat(100).slice(0, 1000) });

  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('link', { name: title })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
  await page.getByRole('main').getByRole('button', { name: 'Nova skupina' }).click();
  await expect(page.getByRole('dialog', { name: 'Nova skupina' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
});

test('FR-002-01 FR-002-06 FR-002-07: upravljanje s tipkovnico – dialog, meni preklopa in navigacija skupine', async ({
  page,
}) => {
  await signedIn(page);
  const main = page.getByRole('main');
  const trigger = main.getByRole('button', { name: 'Nova skupina' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Nova skupina' });
  await expect(dialog.getByRole('textbox', { name: 'Naslov' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('textbox', { name: 'Opis' })).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await createGroup(page, { title: 'Prva' });
  await createGroup(page, { title: 'Druga' });
  if (!isWide(page)) {
    const button = page.getByRole('button', { name: 'Preklopi skupino' });
    await button.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Preklopi skupino' });
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  }
  const settings = page
    .getByRole('navigation', { name: 'Razdelki skupine' })
    .getByRole('link', { name: 'Nastavitve' });
  await settings.focus();
  await expect(settings).toBeFocused();
  await expect(settings).toHaveAttribute('aria-current', 'page');
});

test('SC-002: zaslon Skupine s 100 skupinami je pripravljen v manj kot 2 sekundah', async ({
  page,
}) => {
  const ana = await signedIn(page);
  createGroupsBulk(ana.email, 100, 'OWNER');
  const main = page.getByRole('main');

  const started = Date.now();
  await page.goto('/');
  await expect(main.getByRole('heading', { level: 2, name: 'Lastnik (100)' })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Skupina \d{3}$/ })).toHaveCount(25);
  const elapsed = Date.now() - started;

  expect(elapsed).toBeLessThan(2000);
  await expect(main.getByRole('navigation', { name: 'Strani rezultatov: Lastnik' })).toBeVisible();
});
