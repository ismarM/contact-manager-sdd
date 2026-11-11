import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  contactSummary,
  filterOptionsReply,
  GROUP_ID,
  listQueries,
  manyTags,
  renderContactsApp,
  resultsReply,
} from '../../test/contactsApi';

// Filtri po atributih in značkah (FR-008-03 … FR-008-06, FR-008-11, FR-008-12; specs/008-iskanje/plan.md – Key
// elements). Panel se ob odprtju napolni iz naslova; ob odprtju ima eno prazno vrstico pogoja (»Atribut 1«).

const PATH = `/groups/${GROUP_ID}/contacts`;
const TABLE = 'Kontakti skupine Projekt FERI';

const JANEZ = contactSummary(1, {
  displayName: 'Janez Novak',
  firstName: 'Janez',
  lastName: 'Novak',
});
const MOJCA = contactSummary(2, {
  displayName: 'Mojca Kralj',
  firstName: 'Mojca',
  lastName: 'Kralj',
});

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function area() {
  return within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
}

async function openPanel(user: UserEvent) {
  const search = await area();
  await user.click(search.getByRole('button', { name: /^Filtri/ }));
  return within(await screen.findByRole('group', { name: 'Filtri kontaktov' }));
}

function urlParams() {
  return new URLSearchParams(window.location.search);
}

function app(path: string, options: Parameters<typeof renderContactsApp>[1] = {}) {
  return renderContactsApp(path, {
    role: 'VIEWER',
    ...options,
    contacts: {
      list: resultsReply([JANEZ, MOJCA]),
      filters: () => filterOptionsReply(['kompetenca', 'podjetje'], ['konferenca2025', 'vip']),
      ...options.contacts,
    },
  });
}

describe('ContactFilters', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-008-06: gumb »Filtri« odpre in zapre panel (aria-expanded), možnosti se naložijo samo enkrat', async () => {
    const { api, user } = app(PATH);
    const search = await area();
    const button = search.getByRole('button', { name: 'Filtri' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Filtri kontaktov' })).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('group', { name: 'Filtri kontaktov' })).toBeInTheDocument();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    await screen.findByRole('group', { name: 'Filtri kontaktov' });

    expect(api.of('GET', `/api/groups/${GROUP_ID}/contact-filters`)).toHaveLength(1);
  });

  it('FR-008-06: izbira atributa ponuja predefinirana polja in ključe skupine, značke so potrditvena polja', async () => {
    const { user } = app(PATH);

    const panel = await openPanel(user);

    const select = panel.getByRole('combobox', { name: 'Atribut 1' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Ime', 'Priimek', 'Naslov', 'E-naslov', 'Telefon', 'kompetenca', 'podjetje']);
    expect(panel.getByRole('textbox', { name: 'Vrednost 1' })).toBeInTheDocument();
    const tags = within(panel.getByRole('group', { name: 'Značke' }));
    expect(tags.getByRole('checkbox', { name: 'vip' })).not.toBeChecked();
    expect(tags.getByRole('checkbox', { name: 'konferenca2025' })).not.toBeChecked();
  });

  it('FR-008-06: v angleščini so imena polj in gumbov angleška', async () => {
    await i18n.changeLanguage('en');
    const { user } = app(PATH);
    const search = within(await screen.findByRole('search', { name: 'Search and filters' }));
    await user.click(search.getByRole('button', { name: 'Filters' }));

    const panel = within(await screen.findByRole('group', { name: 'Contact filters' }));

    const select = panel.getByRole('combobox', { name: 'Attribute 1' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['First name', 'Last name', 'Address', 'Email', 'Phone', 'kompetenca', 'podjetje']);
    expect(panel.getByRole('textbox', { name: 'Value 1' })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Add condition' })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Apply filters' })).toBeInTheDocument();
    expect(panel.getByRole('searchbox', { name: 'Find tag' })).toBeInTheDocument();
  });

  it('FR-008-06: skupina brez značk pokaže razlago', async () => {
    const { user } = app(PATH, { contacts: { filters: () => filterOptionsReply([], []) } });

    const panel = await openPanel(user);

    expect(
      within(panel.getByRole('group', { name: 'Značke' })).queryAllByRole('checkbox'),
    ).toHaveLength(0);
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Filtri kontaktov' })).toHaveTextContent(
        'V tej skupini ni značk.',
      ),
    );
  });

  it('FR-008-03: »Dodaj pogoj« doda vrstico, »Odstrani pogoj 2« jo odstrani; najvec 10 pogojev', async () => {
    const { user } = app(PATH);
    const panel = await openPanel(user);

    await user.click(panel.getByRole('button', { name: 'Dodaj pogoj' }));
    expect(panel.getByRole('combobox', { name: 'Atribut 2' })).toBeInTheDocument();
    expect(panel.getByRole('textbox', { name: 'Vrednost 2' })).toBeInTheDocument();
    await user.click(panel.getByRole('button', { name: 'Odstrani pogoj 2' }));
    expect(panel.queryByRole('combobox', { name: 'Atribut 2' })).not.toBeInTheDocument();

    for (let i = 0; i < 9; i++) {
      await user.click(panel.getByRole('button', { name: 'Dodaj pogoj' }));
    }
    expect(panel.getAllByRole('combobox', { name: /^Atribut / })).toHaveLength(10);
    const add = panel.getByRole('button', { name: 'Dodaj pogoj' });
    await user.click(add);

    expect(panel.getAllByRole('combobox', { name: /^Atribut / })).toHaveLength(10);
    expect(panel.queryByRole('combobox', { name: 'Atribut 11' })).not.toBeInTheDocument();
    expect(add).toHaveAccessibleDescription('Dodaš lahko največ 10 pogojev.');
  });

  it('FR-008-03 FR-008-04 FR-008-11: uporaba filtrov zapiše pogoj in znački v naslov, pošlje zahtevek na stran 1', async () => {
    const { api, user } = app(`${PATH}?page=3&size=25`, {
      contacts: { list: resultsReply([JANEZ, MOJCA], 120) },
    });
    const panel = await openPanel(user);

    await user.selectOptions(panel.getByRole('combobox', { name: 'Atribut 1' }), 'kompetenca');
    await user.type(panel.getByRole('textbox', { name: 'Vrednost 1' }), 'web');
    const tags = within(panel.getByRole('group', { name: 'Značke' }));
    await user.click(tags.getByRole('checkbox', { name: 'vip' }));
    await user.click(tags.getByRole('checkbox', { name: 'konferenca2025' }));
    await user.click(panel.getByRole('button', { name: 'Uporabi filtre' }));

    await waitFor(() => expect(urlParams().getAll('f')).toEqual(['x.kompetenca:web']));
    expect(urlParams().getAll('tag')).toEqual(['vip', 'konferenca2025']);
    expect(urlParams().get('page')).toBeNull();
    const last = listQueries(api).at(-1);
    expect(last?.f).toEqual(['x.kompetenca:web']);
    expect(last?.tag).toEqual(['vip', 'konferenca2025']);
    expect(last?.page).toBe('0');
    expect((await area()).getByRole('button', { name: 'Filtri (3)' })).toBeInTheDocument();
  });

  it('FR-008-03: pogoj nad predefiniranim poljem; prazna vrstica se ne pošlje', async () => {
    const { api, user } = app(PATH);
    const panel = await openPanel(user);
    await user.click(panel.getByRole('button', { name: 'Dodaj pogoj' }));
    await user.selectOptions(panel.getByRole('combobox', { name: 'Atribut 2' }), 'E-naslov');
    await user.type(panel.getByRole('textbox', { name: 'Vrednost 2' }), 'feri.si');

    await user.click(panel.getByRole('button', { name: 'Uporabi filtre' }));

    await waitFor(() => expect(urlParams().getAll('f')).toEqual(['email:feri.si']));
    expect(listQueries(api).at(-1)?.f).toEqual(['email:feri.si']);
  });

  it('FR-008-05: iskalni niz, pogoj in značka v enem zahtevku', async () => {
    const { api, user } = app(`${PATH}?q=novak`);
    const panel = await openPanel(user);
    await user.selectOptions(panel.getByRole('combobox', { name: 'Atribut 1' }), 'Telefon');
    await user.type(panel.getByRole('textbox', { name: 'Vrednost 1' }), '041');
    await user.click(
      within(panel.getByRole('group', { name: 'Značke' })).getByRole('checkbox', { name: 'vip' }),
    );

    await user.click(panel.getByRole('button', { name: 'Uporabi filtre' }));

    await waitFor(() =>
      expect(listQueries(api).at(-1)).toMatchObject({ q: 'novak', f: ['phone:041'], tag: ['vip'] }),
    );
  });

  it('FR-008-11: uporabljeni filtri so oznake z gumbi »Odstrani filter …«, odstranitev osveži seznam', async () => {
    const { api, user } = app(`${PATH}?f=x.kompetenca:web&tag=vip&tag=konferenca2025`);
    const search = await area();

    const list = search.getByRole('list', { name: 'Uporabljeni filtri' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(search.getByRole('button', { name: 'Filtri (3)' })).toBeInTheDocument();
    await user.click(
      within(list).getByRole('button', { name: 'Odstrani filter Značka: konferenca2025' }),
    );

    await waitFor(() => expect(urlParams().getAll('tag')).toEqual(['vip']));
    expect(listQueries(api).at(-1)?.tag).toEqual(['vip']);
    expect(search.getByRole('button', { name: 'Filtri (2)' })).toBeInTheDocument();
    expect(
      within(search.getByRole('list', { name: 'Uporabljeni filtri' })).queryByRole('button', {
        name: 'Odstrani filter Značka: konferenca2025',
      }),
    ).not.toBeInTheDocument();
  });

  it('FR-008-11: po odstranitvi oznake fokus preide na naslednjo, sicer prejšnjo, sicer na gumb »Filtri«', async () => {
    const { user } = app(`${PATH}?f=x.kompetenca:web&tag=vip&tag=konferenca2025`);
    const search = await area();
    const remove = (label: string) =>
      search.getByRole('button', { name: `Odstrani filter ${label}` });

    await user.click(remove('kompetenca vsebuje web'));
    await waitFor(() => expect(remove('Značka: vip')).toHaveFocus());

    await user.click(remove('Značka: konferenca2025'));
    await waitFor(() => expect(remove('Značka: vip')).toHaveFocus());

    await user.click(remove('Značka: vip'));
    await waitFor(() => expect(search.getByRole('button', { name: 'Filtri' })).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('FR-008-12: »Počisti filtre« ob oznakah odstrani iskanje in filtre, ohrani razvrstitev in velikost, stran 1', async () => {
    const { api, user } = app(
      `${PATH}?q=novak&f=email:feri.si&tag=vip&sort=email&dir=desc&size=50&page=3`,
      { contacts: { list: resultsReply([JANEZ, MOJCA], 200) } },
    );
    const search = await area();

    await user.click(search.getByRole('button', { name: 'Počisti filtre' }));

    await waitFor(() => expect(urlParams().get('q')).toBeNull());
    expect(urlParams().getAll('f')).toEqual([]);
    expect(urlParams().getAll('tag')).toEqual([]);
    expect(urlParams().get('sort')).toBe('email');
    expect(urlParams().get('dir')).toBe('desc');
    expect(urlParams().get('size')).toBe('50');
    expect(urlParams().get('page')).toBeNull();
    expect(listQueries(api).at(-1)).toMatchObject({
      q: null,
      f: [],
      tag: [],
      sort: 'email',
      dir: 'desc',
      size: '50',
      page: '0',
    });
  });

  it('FR-008-12: »Počisti filtre« v panelu počisti vse', async () => {
    const { user } = app(`${PATH}?f=email:feri.si&tag=vip`);
    const panel = await openPanel(user);

    await user.click(panel.getByRole('button', { name: 'Počisti filtre' }));

    await waitFor(() => expect(urlParams().getAll('f')).toEqual([]));
    expect(urlParams().getAll('tag')).toEqual([]);
  });

  it('FR-008-12 FR-008-13: »Počisti filtre« v praznem stanju', async () => {
    const { user } = app(`${PATH}?tag=vip`, {
      contacts: { list: (url) => resultsReply(url.searchParams.has('tag') ? [] : [JANEZ])(url) },
    });
    await screen.findByRole('heading', { name: 'Ni kontaktov, ki ustrezajo filtrom.' });

    // v `main` je gumb v praznem stanju/opozorilu zadnji (ob oznakah je prvi, v območju iskanja)
    const clear = within(screen.getByRole('main')).getAllByRole('button', {
      name: 'Počisti filtre',
    });
    await user.click(clear.at(-1) as HTMLElement);

    expect(await screen.findByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(urlParams().getAll('tag')).toEqual([]);
  });

  it('FR-008-09: panel se ob odprtju napolni iz naslova (deljena povezava)', async () => {
    const { user } = app(`${PATH}?f=x.kompetenca:web&tag=vip`);

    const panel = await openPanel(user);

    expect(panel.getByRole('combobox', { name: 'Atribut 1' })).toHaveDisplayValue('kompetenca');
    expect(panel.getByRole('textbox', { name: 'Vrednost 1' })).toHaveValue('web');
    expect(
      within(panel.getByRole('group', { name: 'Značke' })).getByRole('checkbox', { name: 'vip' }),
    ).toBeChecked();
  });

  it('FR-008-04 (M1): značka iz naslova, ki je ni med možnostmi, je obkljukano polje in jo »Uporabi filtre« ohrani', async () => {
    const { user } = app(`${PATH}?tag=izbrisana&tag=vip`);
    const search = await area();
    expect(
      search.getByRole('button', { name: 'Odstrani filter Značka: izbrisana' }),
    ).toBeInTheDocument();
    const panel = await openPanel(user);
    const tags = within(panel.getByRole('group', { name: 'Značke' }));

    expect(tags.getByRole('checkbox', { name: 'izbrisana' })).toBeChecked();
    expect(tags.getByRole('checkbox', { name: 'vip' })).toBeChecked();
    await user.click(panel.getByRole('button', { name: 'Uporabi filtre' }));
    await waitFor(() => expect(urlParams().getAll('tag')).toEqual(['izbrisana', 'vip']));

    const reopened = within(await screen.findByRole('group', { name: 'Filtri kontaktov' }));
    await user.click(
      within(reopened.getByRole('group', { name: 'Značke' })).getByRole('checkbox', {
        name: 'izbrisana',
      }),
    );
    await user.click(reopened.getByRole('button', { name: 'Uporabi filtre' }));
    await waitFor(() => expect(urlParams().getAll('tag')).toEqual(['vip']));
  });

  it('FR-008-03 (M1): ključ iz naslova, ki ga ni med možnostmi, je dodatna izbira, pogoj ostane viden in odstranljiv', async () => {
    const { user } = app(`${PATH}?f=x.zbrisan:abc`);
    const search = await area();
    expect(
      search.getByRole('button', { name: 'Odstrani filter zbrisan vsebuje abc' }),
    ).toBeInTheDocument();

    const panel = await openPanel(user);

    expect(panel.getByRole('combobox', { name: 'Atribut 1' })).toHaveDisplayValue('zbrisan');
    expect(panel.getByRole('textbox', { name: 'Vrednost 1' })).toHaveValue('abc');
  });

  it('FR-008-06: napaka pri nalaganju možnosti pokaže opozorilo s ponovnim poskusom', async () => {
    let calls = 0;
    const { user } = app(PATH, {
      contacts: {
        filters: () => {
          calls += 1;
          return calls === 1 ? { status: 500 } : filterOptionsReply(['kompetenca'], ['vip']);
        },
      },
    });
    const panel = await openPanel(user);

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Filtrov ni bilo mogoče naložiti. Poskusi znova.',
    );
    await user.click(panel.getByRole('button', { name: 'Poskusi znova' }));

    expect(
      await within(panel.getByRole('group', { name: 'Značke' })).findByRole('checkbox', {
        name: 'vip',
      }),
    ).toBeInTheDocument();
    expect(panel.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-008-06: tipka Esc zapre panel in vrne fokus na gumb »Filtri«', async () => {
    const { user } = app(PATH);
    const panel = await openPanel(user);
    await user.click(panel.getByRole('textbox', { name: 'Vrednost 1' }));

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Filtri kontaktov' })).not.toBeInTheDocument(),
    );
    expect((await area()).getByRole('button', { name: 'Filtri' })).toHaveFocus();
  });

  // --- iskanje značk (D-67, možnost A) in velike skupine značk ---

  it('FR-008-06: »Poišči značko« zoži seznam brez razlike velikosti črk in strešic, status pove število', async () => {
    const { user } = app(PATH, {
      contacts: { filters: () => filterOptionsReply([], ['čeh', 'cene', 'Žaba', 'vip']) },
    });
    const panel = await openPanel(user);
    const tags = within(panel.getByRole('group', { name: 'Značke' }));
    const box = panel.getByRole('searchbox', { name: 'Poišči značko' });

    await user.type(box, 'CEH');
    expect(tags.getByRole('checkbox', { name: 'čeh' })).toBeInTheDocument();
    expect(tags.queryByRole('checkbox', { name: 'cene' })).not.toBeInTheDocument();
    expect(panel.getByRole('status')).toHaveTextContent('Značke: prikazanih 1 od 1');

    await user.clear(box);
    await user.type(box, 'zaba');
    expect(tags.getByRole('checkbox', { name: 'Žaba' })).toBeInTheDocument();
    expect(tags.queryByRole('checkbox', { name: 'čeh' })).not.toBeInTheDocument();
  });

  it('FR-008-06 (D-67): izbrane značke ostanejo prikazane, tudi če jih iskanje ne zadene', async () => {
    const { user } = app(PATH);
    const panel = await openPanel(user);
    const tags = within(panel.getByRole('group', { name: 'Značke' }));
    await user.click(tags.getByRole('checkbox', { name: 'vip' }));

    await user.type(panel.getByRole('searchbox', { name: 'Poišči značko' }), 'konf');

    expect(tags.getByRole('checkbox', { name: 'konferenca2025' })).not.toBeChecked();
    expect(tags.getByRole('checkbox', { name: 'vip' })).toBeChecked();
  });

  it('FR-008-06 (D-67): pri 1000 značkah je v DOM največ 100 neizbranih polj, status in iskanje delujejo hitro', async () => {
    const all = manyTags(1000);
    const { user } = app(PATH, { contacts: { filters: () => filterOptionsReply([], all) } });
    const started = performance.now();
    const panel = await openPanel(user);
    const tags = within(panel.getByRole('group', { name: 'Značke' }));
    await tags.findByRole('checkbox', { name: 'znacka0001' });
    const opened = performance.now() - started;

    expect(opened).toBeLessThan(1000);
    expect(tags.getAllByRole('checkbox').length).toBeLessThanOrEqual(100);
    expect(panel.getByRole('status')).toHaveTextContent('Značke: prikazanih 100 od 1000');
    expect(panel.getByRole('status')).toHaveTextContent('Vpiši iskanje za ožji izbor.');

    const box = panel.getByRole('searchbox', { name: 'Poišči značko' });
    await user.click(box);
    const typed = performance.now();
    await user.paste('znacka0512');
    await tags.findByRole('checkbox', { name: 'znacka0512' });
    expect(performance.now() - typed).toBeLessThan(500);
    expect(tags.getAllByRole('checkbox')).toHaveLength(1);
    expect(panel.getByRole('status')).toHaveTextContent('Značke: prikazanih 1 od 1');

    await user.clear(box);
    await user.paste('znacka05');
    await waitFor(() =>
      expect(panel.getByRole('status')).toHaveTextContent('Značke: prikazanih 100 od 100'),
    );
  });

  it('FR-008-06 (D-67): značke so dosegljive in izbirne samo s tipkovnico', async () => {
    const { user } = app(PATH, {
      contacts: { filters: () => filterOptionsReply([], manyTags(1000)) },
    });
    const panel = await openPanel(user);
    const tags = within(panel.getByRole('group', { name: 'Značke' }));
    await tags.findByRole('checkbox', { name: 'znacka0001' });

    await user.click(panel.getByRole('searchbox', { name: 'Poišči značko' }));
    await user.tab();
    expect(tags.getByRole('checkbox', { name: 'znacka0001' })).toHaveFocus();
    await user.keyboard(' ');

    expect(tags.getByRole('checkbox', { name: 'znacka0001' })).toBeChecked();
  });

  it('FR-008-06 (D-67): brez kršitev axe pri 1000 značkah (sl in en)', async () => {
    const { container, user } = app(PATH, {
      contacts: { filters: () => filterOptionsReply(['kompetenca'], manyTags(1000)) },
    });
    const panel = await openPanel(user);
    await within(panel.getByRole('group', { name: 'Značke' })).findByRole('checkbox', {
      name: 'znacka0001',
    });
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    await within(await screen.findByRole('group', { name: 'Contact filters' })).findByRole(
      'searchbox',
      {
        name: 'Find tag',
      },
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-008-11: brez kršitev axe z odprtim panelom, oznakami in praznim stanjem (sl in en)', async () => {
    const { container, user } = app(`${PATH}?f=x.kompetenca:web&tag=vip`);
    await openPanel(user);
    await screen.findByRole('table', { name: TABLE });
    await sleep(50);
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    await screen.findByRole('group', { name: 'Contact filters' });
    expect((await axe(container)).violations).toEqual([]);
  });
});
