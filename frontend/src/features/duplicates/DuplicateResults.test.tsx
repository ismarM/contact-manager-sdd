import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  compareContact,
  compareReply,
  contactId,
  duplicateGroup,
  duplicatesReply,
  GROUP_ID,
  renderDuplicatesApp,
} from '../../test/duplicatesApi';

// Rezultati iskanja dvojnikov: kartice, razlogi, prvih 10 + »Še N«, povezava na primerjavo, strani, prazno stanje,
// napaka, obvestilo »skupine ni več« (FR-011-03 … 05, 07, 16, 21; specs/011-dvojniki/plan.md – Key elements).

const PAGE = `/groups/${GROUP_ID}/duplicates`;
const COMPARE = `${PAGE}/compare`;

type Options = NonNullable<Parameters<typeof renderDuplicatesApp>[1]>;

const TWO_GROUPS = [
  duplicateGroup('email', 'janez@primer.si', [
    { n: 1, name: 'Janez Novak' },
    { n: 2, name: 'Janez Novak ml.' },
  ]),
  duplicateGroup('email', 'ana@primer.si', [
    { n: 3, name: 'Ana Kos' },
    { n: 4, name: 'Ana Kos' },
  ]),
];

/** Skupine z id-ji, ki se ne prekrivajo (n-ta skupina ima kontakta 2n+1 in 2n+2). */
function manyGroups(count: number) {
  return Array.from({ length: count }, (_, i) =>
    duplicateGroup('email', `oseba${String(i).padStart(2, '0')}@primer.si`, [
      { n: 2 * i + 1, name: `Oseba ${i} A` },
      { n: 2 * i + 2, name: `Oseba ${i} B` },
    ]),
  );
}

/** Odgovor strani `page` (0-osno) za 30 skupin; stran prek zadnje je prazna, `total` ostane 30. */
function pagedSearch(all = manyGroups(30)) {
  return (url: URL) => {
    const size = Number(url.searchParams.get('size'));
    const page = Number(url.searchParams.get('page'));
    return duplicatesReply(all.slice(page * size, (page + 1) * size), {
      total: all.length,
      page,
      size,
    });
  };
}

function app(path: string, options: Options = {}) {
  return renderDuplicatesApp(path, { role: 'EDITOR', ...options });
}

/** Počaka, da je med `status` obvestili element z natančno tem besedilom. */
async function expectStatus(text: string) {
  await waitFor(() =>
    expect(screen.getAllByRole('status').map((element) => element.textContent)).toContain(text),
  );
}

const card = async (name: string) => within(await screen.findByRole('listitem', { name }));

describe('DuplicateResults', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-011-07: odgovor z 2 skupinama – seznam »Skupine dvojnikov« z dvema karticama in statusom »Skupin dvojnikov: 2«', async () => {
    app(`${PAGE}?category=email`, { duplicates: { search: () => duplicatesReply(TWO_GROUPS) } });

    const list = await screen.findByRole('list', { name: 'Skupine dvojnikov' });
    const cards = within(list).getAllByRole('listitem', { name: /^Enak e-naslov/ });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAccessibleName('Enak e-naslov: janez@primer.si');
    expect(cards[1]).toHaveAccessibleName('Enak e-naslov: ana@primer.si');
    await expectStatus('Skupin dvojnikov: 2');
  });

  it('FR-011-07: kartica ima seznam »Kontakti v skupini« z imeni in gumb »Primerjaj in združi«', async () => {
    app(`${PAGE}?category=email`, { duplicates: { search: () => duplicatesReply(TWO_GROUPS) } });

    const janez = await card('Enak e-naslov: janez@primer.si');
    const contacts = janez.getByRole('list', { name: 'Kontakti v skupini' });
    expect(
      within(contacts)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Janez Novak', 'Janez Novak ml.']);
    expect(janez.getByRole('button', { name: 'Primerjaj in združi' })).toBeInTheDocument();
  });

  it.each([
    ['name', 'Janez Novak', 'Enako ime in priimek: Janez Novak'],
    ['phone', '+386 41 123 456', 'Enak telefon: +386 41 123 456'],
  ] as const)(
    'FR-011-03: kategorija %s – razlog kartice »%s« je »%s«',
    async (category, value, reason) => {
      app(`${PAGE}?category=${category}`, {
        duplicates: {
          search: () =>
            duplicatesReply([duplicateGroup(category, value, [{ n: 1 }, { n: 2 }])], { category }),
        },
      });

      expect(await screen.findByRole('listitem', { name: reason })).toBeInTheDocument();
    },
  );

  it('FR-011-21: skupina s 14 kontakti – prvih 10 imen in gumb »Še 4 kontakti«, ki razkrije preostale 4', async () => {
    const big = duplicateGroup(
      'email',
      'janez@primer.si',
      Array.from({ length: 14 }, (_, i) => ({ n: i + 1 })),
    );
    const { user } = app(`${PAGE}?category=email`, {
      duplicates: { search: () => duplicatesReply([big]) },
    });

    const janez = await card('Enak e-naslov: janez@primer.si');
    const more = janez.getByRole('button', { name: 'Še 4 kontakti' });
    const list = janez.getByRole('list', { name: 'Kontakti v skupini' });
    const names = (count: number) => Array.from({ length: count }, (_, i) => `Kontakt ${i + 1}`);

    // Zaprto: v seznamu (tudi za bralnike zaslona) je samo prvih 10 kontaktov, ki gredo v primerjavo.
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(names(10));
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await user.click(more);

    expect(more).toHaveAttribute('aria-expanded', 'true');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(names(14));
    for (const item of items) expect(item).toBeVisible();
  });

  it('FR-011-21: »Primerjaj in združi« odpre primerjavo prvih 10 kontaktov z total=14', async () => {
    const big = duplicateGroup(
      'email',
      'janez@primer.si',
      Array.from({ length: 14 }, (_, i) => ({ n: i + 1 })),
    );
    const first10 = Array.from({ length: 10 }, (_, i) => contactId(i + 1));
    const { user } = app(`${PAGE}?category=email`, {
      duplicates: {
        search: () => duplicatesReply([big], { page: 0 }),
        compare: (ids) => compareReply(ids.map((_, i) => compareContact({ n: i + 1 }))),
      },
    });

    const janez = await card('Enak e-naslov: janez@primer.si');
    await user.click(janez.getByRole('button', { name: 'Primerjaj in združi' }));

    await waitFor(() => expect(window.location.pathname).toBe(COMPARE));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('category')).toBe('email');
    expect(params.get('page')).toBe('1');
    expect(params.get('size')).toBe('25');
    expect(params.get('ids')?.split(',')).toEqual(first10);
    expect(params.get('total')).toBe('14');
  });

  it('FR-011-07: skupina s 3 kontakti – ids vsi 3, total=3 in brez gumba »Še …«', async () => {
    const three = duplicateGroup('email', 'janez@primer.si', [{ n: 1 }, { n: 2 }, { n: 3 }]);
    const { user } = app(`${PAGE}?category=email`, {
      duplicates: {
        search: () => duplicatesReply([three]),
        compare: (ids) => compareReply(ids.map((_, i) => compareContact({ n: i + 1 }))),
      },
    });

    const janez = await card('Enak e-naslov: janez@primer.si');
    expect(janez.queryByRole('button', { name: /^Še / })).not.toBeInTheDocument();
    await user.click(janez.getByRole('button', { name: 'Primerjaj in združi' }));

    await waitFor(() => expect(window.location.pathname).toBe(COMPARE));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('ids')?.split(',')).toEqual([1, 2, 3].map(contactId));
    expect(params.get('total')).toBe('3');
  });

  it('FR-011-07: 30 skupin, 25 na strani – »Stran 1 od 2«, »Naslednja« gre na page=2, fokus na naslovu rezultatov', async () => {
    const { user, duplicatesApi } = app(`${PAGE}?category=email`, {
      duplicates: { search: pagedSearch() },
    });

    const nav = await screen.findByRole('navigation', { name: 'Strani rezultatov' });
    expect(nav).toHaveTextContent('Stran 1 od 2');
    expect(
      within(screen.getByRole('list', { name: 'Skupine dvojnikov' })).getAllByRole('listitem', {
        name: /^Enak e-naslov/,
      }),
    ).toHaveLength(25);

    await user.click(within(nav).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() => expect(new URLSearchParams(window.location.search).get('page')).toBe('2'));
    expect(duplicatesApi.gets('').at(-1)?.search.toString()).toBe('category=email&page=1&size=25');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Dvojniki' })).toHaveFocus(),
    );
    expect(
      within(screen.getByRole('list', { name: 'Skupine dvojnikov' })).getAllByRole('listitem', {
        name: /^Enak e-naslov/,
      }),
    ).toHaveLength(5);
  });

  it('FR-011-07: velikost strani 50 – zahtevek in naslov imata size=50, vse skupine na eni strani', async () => {
    const { user, duplicatesApi } = app(`${PAGE}?category=email`, {
      duplicates: { search: pagedSearch() },
    });
    const nav = await screen.findByRole('navigation', { name: 'Strani rezultatov' });

    await user.selectOptions(within(nav).getByRole('combobox', { name: 'Velikost strani' }), '50');

    await waitFor(() => expect(duplicatesApi.gets('').at(-1)?.search.get('size')).toBe('50'));
    expect(new URLSearchParams(window.location.search).get('size')).toBe('50');
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Skupine dvojnikov' })).getAllByRole('listitem', {
          name: /^Enak e-naslov/,
        }),
      ).toHaveLength(30),
    );
  });

  it('FR-011-07: stran prek zadnje (prazen groups, total > 0) preusmeri na zadnjo stran', async () => {
    const { duplicatesApi } = app(`${PAGE}?category=email&page=5`, {
      duplicates: { search: pagedSearch() },
    });

    await waitFor(() => expect(new URLSearchParams(window.location.search).get('page')).toBe('2'));
    expect(duplicatesApi.gets('').at(-1)?.search.toString()).toBe('category=email&page=1&size=25');
    expect(
      await within(await screen.findByRole('list', { name: 'Skupine dvojnikov' })).findAllByRole(
        'listitem',
        { name: /^Enak e-naslov/ },
      ),
    ).toHaveLength(5);
  });

  it('FR-011-07: prazen odgovor – status »Ni dvojnikov po kategoriji E-naslov.« in brez seznama', async () => {
    app(`${PAGE}?category=email`);

    await expectStatus('Ni dvojnikov po kategoriji E-naslov.');
    expect(screen.queryByRole('list', { name: 'Skupine dvojnikov' })).not.toBeInTheDocument();
  });

  it('FR-011-18: napaka 5xx – alert »Dvojnikov ni bilo mogoče naložiti. Poskusi znova.«, »Poskusi znova« ponovi zahtevek', async () => {
    let calls = 0;
    const { user, duplicatesApi } = app(`${PAGE}?category=email`, {
      duplicates: {
        search: () => {
          calls += 1;
          return calls === 1
            ? { status: 500, body: { code: 'INTERNAL' } }
            : duplicatesReply(TWO_GROUPS);
        },
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dvojnikov ni bilo mogoče naložiti. Poskusi znova.',
    );
    await user.click(screen.getByRole('button', { name: 'Poskusi znova' }));

    expect(await screen.findByRole('list', { name: 'Skupine dvojnikov' })).toBeInTheDocument();
    expect(duplicatesApi.gets('')).toHaveLength(2);
    expect(duplicatesApi.gets('')[1]?.search.toString()).toBe(
      duplicatesApi.gets('')[0]?.search.toString(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-011-16: po navigaciji iz primerjave z enim kontaktom – status »Te skupine dvojnikov ni več.«', async () => {
    const { user } = app(`${PAGE}?category=email`, {
      duplicates: {
        search: () => duplicatesReply(TWO_GROUPS),
        compare: () => compareReply([compareContact({ n: 1 })]),
      },
    });

    const janez = await card('Enak e-naslov: janez@primer.si');
    await user.click(janez.getByRole('button', { name: 'Primerjaj in združi' }));

    await expectStatus('Te skupine dvojnikov ni več.');
    expect(window.location.pathname).toBe(PAGE);
  });

  it('FR-011-07: rezultati v angleščini – seznami, razlog, »Compare and merge«, prazno stanje, napaka', async () => {
    await i18n.changeLanguage('en');
    const view = app(`${PAGE}?category=email`, {
      duplicates: { search: () => duplicatesReply(TWO_GROUPS) },
    });

    const janez = await card('Same email: janez@primer.si');
    expect(screen.getByRole('list', { name: 'Duplicate groups' })).toBeInTheDocument();
    expect(janez.getByRole('list', { name: 'Contacts in the group' })).toBeInTheDocument();
    expect(janez.getByRole('button', { name: 'Compare and merge' })).toBeInTheDocument();
    await expectStatus('2 groups of duplicates');
    view.unmount();

    app(`${PAGE}?category=email`);
    await expectStatus('No duplicates in category Email.');
  });

  it('FR-011-18: napaka nalaganja v angleščini – »Duplicates could not be loaded. Try again.« in »Try again«', async () => {
    await i18n.changeLanguage('en');
    app(`${PAGE}?category=email`, {
      duplicates: { search: () => ({ status: 500, body: { code: 'INTERNAL' } }) },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Duplicates could not be loaded. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('FR-011-07: axe brez kršitev (rezultati, prazno stanje, napaka)', async () => {
    const results = app(`${PAGE}?category=email`, { duplicates: { search: pagedSearch() } });
    await screen.findByRole('list', { name: 'Skupine dvojnikov' });
    expect((await axe(results.container)).violations).toEqual([]);
    results.unmount();

    const empty = app(`${PAGE}?category=email`);
    await expectStatus('Ni dvojnikov po kategoriji E-naslov.');
    expect((await axe(empty.container)).violations).toEqual([]);
    empty.unmount();

    const failed = app(`${PAGE}?category=email`, {
      duplicates: { search: () => ({ status: 500, body: { code: 'INTERNAL' } }) },
    });
    await screen.findByRole('alert');
    expect((await axe(failed.container)).violations).toEqual([]);
  });
});
