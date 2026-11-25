import { type Browser, type Page, test } from '@playwright/test';
import { createGroup } from '../tests/support/groups';
import { signIn, type TestUser } from '../tests/support/auth';

// Posnetki za predstavitev nad podatki iz docker/demo-seed.mjs, vsak pri treh širinah (konstitucija §3.3: 1280, 768, 360).
// Mapa: SHOTS_DIR (privzeto docs/presentation/screenshots); ime datoteke `<posnetek>-<širina>.png`.
const OUT = process.env.SHOTS_DIR ?? '../docs/presentation/screenshots';
const WIDTHS = [
  [1280, 800],
  [768, 1024],
  [360, 780],
] as const;
const USERS = {
  ana: { name: 'Ana Novak', email: 'ana@demo.si' },
  cvetka: { name: 'Cvetka Zupan', email: 'cvetka@demo.si' },
  david: { name: 'David Horvat', email: 'david@demo.si' },
} satisfies Record<string, TestUser>;
const COMPANY = 'Kartoteka d.o.o.';
const FRIENDS = 'Družina in prijatelji';
const EMPTY = 'Nova skupina';

async function newPage(browser: Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  return context.newPage();
}

async function session(browser: Browser, user: TestUser, width: number, height: number) {
  const page = await newPage(browser, width, height);
  await page.goto('/login');
  await signIn(page, user);
  await page.getByRole('heading', { level: 1, name: /^(Skupine|Groups)$/ }).waitFor();
  return page;
}

async function settle(page: Page) {
  await page.waitForLoadState('load');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1200);
}

async function openGroup(page: Page, title: string): Promise<string> {
  await page.goto('/');
  await page.getByRole('link', { name: title, exact: true }).click();
  await page.waitForURL(/\/groups\/[^/]+\/contacts/);
  await settle(page);
  return /\/groups\/([^/]+)/.exec(page.url())![1];
}

async function openContact(page: Page, groupId: string, name: RegExp) {
  await page.goto(`/groups/${groupId}/contacts`);
  await page.getByRole('link', { name }).first().click();
  await page.waitForURL(new RegExp(`/groups/${groupId}/contacts/[^/]+$`));
}

/** Pomakne stran, da je naslov razdelka tik pod lepljivo zgornjo vrstico. */
async function scrollToHeading(page: Page, name: string) {
  const heading = page.getByRole('heading', { name, exact: true, level: 2 });
  await heading.waitFor();
  await heading.evaluate((el) => {
    const bar = document.querySelector('header');
    const sticky = bar && ['sticky', 'fixed'].includes(getComputedStyle(bar).position);
    const offset = (sticky ? bar.getBoundingClientRect().height : 0) + 24;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
  });
}

function shooter(width: number) {
  return async (page: Page, name: string, fullPage = false) => {
    await settle(page);
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage });
  };
}

for (const [width, height] of WIDTHS) {
  test.describe(`${width} px`, () => {
    const shot = shooter(width);

    test('prijava in registracija', async ({ browser }) => {
      const page = await newPage(browser, width, height);
      await page.goto('/login');
      await shot(page, 'L1-prijava');
      await page.goto('/register');
      await shot(page, 'L2-registracija');
    });

    test('lastnica Ana', async ({ browser }) => {
      const page = await session(browser, USERS.ana, width, height);
      await shot(page, 'A7-skupine-ana');

      const company = await openGroup(page, COMPANY);
      await shot(page, 'A1-kontakti');
      await openContact(page, company, /Nina/);
      await shot(page, 'A2-kontakt-ana');
      await page.goto(`${page.url()}/history`);
      await shot(page, 'A3-zgodovina-kontakta');
      await page.goto(`/groups/${company}/audit`);
      await shot(page, 'A3-revizijska-sled');

      // Člani z vlogami in čakajoča povabila (nastavitve skupine).
      await page.goto(`/groups/${company}/settings`);
      await page.getByRole('main').getByText('Cvetka Zupan').first().waitFor();
      await scrollToHeading(page, 'Člani');
      await shot(page, 'A10-clani');
      await page.getByRole('main').getByText('eva.kos@demo.si').waitFor();
      await scrollToHeading(page, 'Čakajoča povabila');
      await shot(page, 'A10-cakajoca-povabila');

      await page.goto('/invitations');
      await page.getByRole('list', { name: 'Prejeta povabila' }).waitFor();
      await shot(page, 'A11-povabila');

      await page.goto(`/groups/${company}/contacts`);
      await settle(page);
      const boxes = page.getByRole('main').getByRole('checkbox');
      for (const i of [1, 2, 3]) await boxes.nth(i).check();
      await shot(page, 'A4-izbor');
      await page.getByRole('button', { name: 'Uredi izbrane' }).click();
      await page.getByRole('dialog').getByRole('heading').click();
      await shot(page, 'A4-urejanje-izbranih');
      await page.keyboard.press('Escape');

      await page.goto(`/groups/${company}/contacts`);
      await page.getByRole('searchbox').first().fill('zzzz');
      await page.getByRole('heading', { name: 'Ni kontaktov, ki ustrezajo filtrom.' }).waitFor();
      await shot(page, 'A8-ni-zadetkov');

      const friends = await openGroup(page, FRIENDS);
      await page.goto(`/groups/${friends}/duplicates`);
      await page.getByRole('button', { name: 'Poišči dvojnike' }).click();
      await shot(page, 'A5-dvojniki');
      await page
        .getByRole('main')
        .getByRole('button', { name: /Primerjaj/ })
        .first()
        .click();
      await shot(page, 'A5-primerjava');

      // Račun je dolg (~3–4 zasloni); namesto ene zelo visoke slike tri zaslone z izbranimi razdelki.
      await page.goto('/account');
      await shot(page, 'A6-racun');
      await scrollToHeading(page, 'Prijavne metode');
      await shot(page, 'A6-racun-prijavne-metode');
      await scrollToHeading(page, 'API ključi');
      await shot(page, 'A6-racun-api-kljuci');
      await page.goto('/api-docs');
      await shot(page, 'A6-api-docs');
    });

    test('bralec David', async ({ browser }) => {
      const page = await session(browser, USERS.david, width, height);
      await shot(page, 'A7-skupine-david');
      const company = await openGroup(page, COMPANY);
      await shot(page, 'A2-kontakti-david');
      await openContact(page, company, /Nina/);
      await shot(page, 'A2-kontakt-david');
    });

    test('prazna skupina (Cvetka)', async ({ browser }) => {
      const page = await session(browser, USERS.cvetka, width, height);
      const existing = page.getByRole('link', { name: EMPTY, exact: true });
      if ((await existing.count()) === 0) await createGroup(page, { title: EMPTY });
      await openGroup(page, EMPTY);
      await shot(page, 'A9-prazna-skupina');
    });
  });
}
