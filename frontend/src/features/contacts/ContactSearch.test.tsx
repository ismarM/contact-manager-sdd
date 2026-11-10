import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  contactSummary,
  deferred,
  GROUP_ID,
  listQueries,
  renderContactsApp,
  resultsReply,
} from '../../test/contactsApi';

// Hitro iskanje po kontaktih (FR-008-01, FR-008-02, FR-008-10, FR-008-13, FR-008-17; specs/008-iskanje/plan.md –
// Key elements). Vsi elementi iskanja so v območju »Iskanje in filtri«. Zahtevke zabeleži MSW; zadetke podaja test.

const PATH = `/groups/${GROUP_ID}/contacts`;
const TABLE = 'Kontakti skupine Projekt FERI';

const JANEZ = contactSummary(1, {
  firstName: 'Janez',
  lastName: 'Novak',
  displayName: 'Janez Novak',
  email: 'janez@feri.si',
});
const MOJCA = contactSummary(2, {
  firstName: 'Mojca',
  lastName: 'Kralj',
  displayName: 'Mojca Kralj',
  email: 'mojca@primer.si',
});

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function searchArea() {
  return within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
}

async function searchBox() {
  return (await searchArea()).getByRole('searchbox', { name: 'Iskanje po kontaktih' });
}

function urlQuery() {
  return new URLSearchParams(window.location.search);
}

/** Zahtevki z iskalnim nizom (brez prvega zahtevka brez `q`). */
function withQuery(api: Parameters<typeof listQueries>[0]) {
  return listQueries(api).filter((query) => query.q !== null);
}

describe('ContactSearch', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-008-01: območje »Iskanje in filtri« vsebuje iskalno polje (sl in en)', async () => {
    renderContactsApp(PATH, { role: 'VIEWER', contacts: { list: resultsReply([JANEZ, MOJCA]) } });

    expect(await searchBox()).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Iskanje in filtri' })).toBeInTheDocument();
  });

  it('FR-008-01: v angleščini ima območje in polje angleški imeni', async () => {
    await i18n.changeLanguage('en');
    renderContactsApp(PATH, { role: 'VIEWER', contacts: { list: resultsReply([JANEZ]) } });

    const area = within(await screen.findByRole('search', { name: 'Search and filters' }));
    expect(area.getByRole('searchbox', { name: 'Search contacts' })).toBeInTheDocument();
  });

  it('FR-008-01: zahtevek ne gre pred 300 ms, po zadnji tipki gre natanko eden s končnim nizom', async () => {
    const { api, user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: resultsReply([JANEZ, MOJCA]) },
    });
    const box = await searchBox();
    await screen.findByRole('table', { name: TABLE });

    await user.type(box, 'janez novak');
    await sleep(120);
    expect(withQuery(api)).toHaveLength(0);

    await waitFor(() => expect(withQuery(api)).toHaveLength(1));
    await sleep(500);
    expect(withQuery(api).map((query) => query.q)).toEqual(['janez novak']);
  });

  it('FR-008-01: iskalni niz se zapiše v naslov z zamenjavo, zgodovina se ne podaljša', async () => {
    const { api, user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: resultsReply([JANEZ]) },
    });
    const box = await searchBox();
    await screen.findByRole('table', { name: TABLE });
    const historyLength = window.history.length;

    await user.type(box, 'feri');
    await waitFor(() => expect(withQuery(api)).toHaveLength(1));

    expect(urlQuery().get('q')).toBe('feri');
    expect(window.history.length).toBe(historyLength);
  });

  it('FR-008-01: iskalni niz iz naslova je v polju ob odprtju strani', async () => {
    const { api } = renderContactsApp(`${PATH}?q=feri`, {
      role: 'VIEWER',
      contacts: { list: resultsReply([JANEZ]) },
    });

    expect(await searchBox()).toHaveValue('feri');
    await waitFor(() => expect(listQueries(api)[0]?.q).toBe('feri'));
  });

  it('FR-008-02: vmesnik pošlje vpisano besedilo nespremenjeno (šumnike in velikost črk obravnava strežnik)', async () => {
    const { api, user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: resultsReply([JANEZ]) },
    });
    const box = await searchBox();

    await user.type(box, 'ČEH');
    await waitFor(() => expect(withQuery(api)).toHaveLength(1));

    expect(withQuery(api)[0]?.q).toBe('ČEH');
  });

  it('FR-008-01: niz iz samih presledkov ne sproži zahtevka z iskalnim nizom in ni v naslovu', async () => {
    const { api, user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: resultsReply([JANEZ, MOJCA]) },
    });
    const box = await searchBox();
    await screen.findByRole('table', { name: TABLE });

    await user.type(box, '   ');
    await sleep(600);

    expect(withQuery(api).filter((query) => query.q?.trim() !== '')).toHaveLength(0);
    expect(urlQuery().get('q') ?? '').toBe('');
    expect(screen.getByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
  });

  it.each([
    [1, 'Najden 1 kontakt'],
    [2, 'Najdena 2 kontakta'],
    [3, 'Najdeni 3 kontakti'],
    [4, 'Najdeni 4 kontakti'],
    [5, 'Najdenih 5 kontaktov'],
    [18, 'Najdenih 18 kontaktov'],
    [101, 'Najden 101 kontakt'],
    [102, 'Najdena 102 kontakta'],
  ])('FR-008-10: število zadetkov %i se sporoči kot »%s« (sl)', async (total, text) => {
    const items = Array.from({ length: Math.min(total, 25) }, (_, i) => contactSummary(i + 1));
    renderContactsApp(`${PATH}?q=a`, {
      role: 'VIEWER',
      contacts: { list: resultsReply(items, total) },
    });

    const area = await searchArea();

    await waitFor(() => expect(area.getByRole('status')).toHaveTextContent(text));
    expect(area.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [1, '1 contact found'],
    [2, '2 contacts found'],
    [18, '18 contacts found'],
  ])('FR-008-10: število zadetkov %i se sporoči kot "%s" (en)', async (total, text) => {
    await i18n.changeLanguage('en');
    const items = Array.from({ length: Math.min(total, 25) }, (_, i) => contactSummary(i + 1));
    renderContactsApp(`${PATH}?q=a`, {
      role: 'VIEWER',
      contacts: { list: resultsReply(items, total) },
    });

    const area = within(await screen.findByRole('search', { name: 'Search and filters' }));

    await waitFor(() => expect(area.getByRole('status')).toHaveTextContent(text));
  });

  it('FR-008-10: število zadetkov se osveži po vsaki osvežitvi rezultatov', async () => {
    const { user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        list: (url) =>
          url.searchParams.get('q') === 'janez'
            ? resultsReply([JANEZ])(url)
            : resultsReply([JANEZ, MOJCA])(url),
      },
    });
    const area = await searchArea();
    await waitFor(() => expect(area.getByRole('status')).toHaveTextContent('Najdena 2 kontakta'));

    await user.type(area.getByRole('searchbox', { name: 'Iskanje po kontaktih' }), 'janez');

    await waitFor(() => expect(area.getByRole('status')).toHaveTextContent('Najden 1 kontakt'));
  });

  it('FR-008-17: tipkanje med osvežitvijo ne izgubi znakov (odmev naslova polja ne prepiše)', async () => {
    const slow = deferred<ReturnType<ReturnType<typeof resultsReply>>>();
    const { api, user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        list: (url) => {
          const q = url.searchParams.get('q');
          if (q === 'fe') return slow.promise;
          return resultsReply(q === 'feri' ? [JANEZ] : [JANEZ, MOJCA])(url);
        },
      },
    });
    const box = await searchBox();
    await screen.findByRole('table', { name: TABLE });

    await user.type(box, 'fe');
    await waitFor(() => expect(withQuery(api).map((query) => query.q)).toEqual(['fe']));
    await waitFor(() => expect(urlQuery().get('q')).toBe('fe'));
    await user.type(box, 'ri');
    expect(box).toHaveValue('feri');

    slow.resolve(resultsReply([MOJCA])(new URL('http://x/?size=25')));
    await sleep(150);
    expect(box).toHaveValue('feri');

    await waitFor(() => expect(urlQuery().get('q')).toBe('feri'));
    expect(box).toHaveValue('feri');
    await waitFor(() => expect(withQuery(api).map((query) => query.q)).toEqual(['fe', 'feri']));
  });

  it('FR-008-17: zastareli odgovor ne prepiše novejšega', async () => {
    const slow = deferred<ReturnType<ReturnType<typeof resultsReply>>>();
    const { api, user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        list: (url) => {
          const q = url.searchParams.get('q');
          if (q === 'fe') return slow.promise;
          return resultsReply(q === 'feri' ? [JANEZ] : [JANEZ, MOJCA])(url);
        },
      },
    });
    const box = await searchBox();
    await screen.findByRole('table', { name: TABLE });
    await user.type(box, 'fe');
    await waitFor(() => expect(withQuery(api)).toHaveLength(1));
    await user.type(box, 'ri');
    await waitFor(() => expect(withQuery(api).map((query) => query.q)).toEqual(['fe', 'feri']));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Mojca Kralj' })).not.toBeInTheDocument(),
    );

    slow.resolve(resultsReply([MOJCA])(new URL('http://x/?size=25')));
    await sleep(200);

    expect(screen.getByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mojca Kralj' })).not.toBeInTheDocument();
    expect((await searchArea()).getByRole('status')).toHaveTextContent('Najden 1 kontakt');
  });

  it('FR-008-17: med nalaganjem ostane prejšnja vsebina, preglednica je označena kot zasedena', async () => {
    const slow = deferred<ReturnType<ReturnType<typeof resultsReply>>>();
    const { api, user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        list: (url) =>
          url.searchParams.get('q') === 'x' ? slow.promise : resultsReply([JANEZ, MOJCA])(url),
      },
    });
    const box = await searchBox();
    await screen.findByRole('table', { name: TABLE });

    await user.type(box, 'x');
    await waitFor(() => expect(withQuery(api)).toHaveLength(1));

    expect(screen.getByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mojca Kralj' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: TABLE })).toHaveAttribute('aria-busy', 'true');
    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((status) => status.textContent === 'Nalagam…'),
      ).toBe(true),
    );

    slow.resolve(resultsReply([MOJCA])(new URL('http://x/?size=25')));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: TABLE })).not.toHaveAttribute('aria-busy', 'true'),
    );
    expect(screen.queryByRole('link', { name: 'Janez Novak' })).not.toBeInTheDocument();
  });

  it('FR-008-13: iskanje brez zadetkov pokaže prazno stanje s »Počisti filtre«, ki počisti polje in naslov', async () => {
    const { api, user } = renderContactsApp(`${PATH}?q=nihce`, {
      role: 'VIEWER',
      contacts: { list: (url) => resultsReply(url.searchParams.get('q') ? [] : [JANEZ])(url) },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Ni kontaktov, ki ustrezajo filtrom.' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' }),
    ).not.toBeInTheDocument();
    // v `main` je gumb v praznem stanju/opozorilu zadnji (ob oznakah je prvi, v območju iskanja)
    const clear = within(screen.getByRole('main')).getAllByRole('button', {
      name: 'Počisti filtre',
    });
    await user.click(clear.at(-1) as HTMLElement);

    expect(await screen.findByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(await searchBox()).toHaveValue('');
    expect(urlQuery().get('q')).toBeNull();
    expect(listQueries(api).at(-1)?.q).toBeNull();
  });

  it('FR-008-13: *Nazaj* po čiščenju vrne iskalni niz v polje (navigacija od zunaj)', async () => {
    const { user } = renderContactsApp(`${PATH}?q=nihce`, {
      role: 'VIEWER',
      contacts: { list: (url) => resultsReply(url.searchParams.get('q') ? [] : [JANEZ])(url) },
    });
    await screen.findByRole('heading', { name: 'Ni kontaktov, ki ustrezajo filtrom.' });
    // v `main` je gumb v praznem stanju/opozorilu zadnji (ob oznakah je prvi, v območju iskanja)
    const clear = within(screen.getByRole('main')).getAllByRole('button', {
      name: 'Počisti filtre',
    });
    await user.click(clear.at(-1) as HTMLElement);
    await screen.findByRole('link', { name: 'Janez Novak' });

    window.history.back();

    await waitFor(() => expect(urlQuery().get('q')).toBe('nihce'));
    await waitFor(async () => expect(await searchBox()).toHaveValue('nihce'));
  });

  it('FR-008-13: prazna skupina brez iskanja in filtrov ohrani prazno stanje funkcionalnosti 004', async () => {
    renderContactsApp(PATH, { role: 'EDITOR', contacts: { list: resultsReply([]) } });

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ni kontaktov, ki ustrezajo filtrom.' }),
    ).not.toBeInTheDocument();
  });

  it('FR-008-13: brez kršitev axe (sl) – seznam z iskalnim poljem in prazno stanje', async () => {
    const { container } = renderContactsApp(`${PATH}?q=feri`, {
      role: 'VIEWER',
      contacts: { list: resultsReply([JANEZ]) },
    });
    await screen.findByRole('table', { name: TABLE });
    expect(await searchBox()).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-008-13: brez kršitev axe (en) – prazno stanje po iskanju', async () => {
    await i18n.changeLanguage('en');
    const { container } = renderContactsApp(`${PATH}?q=nobody`, {
      role: 'VIEWER',
      contacts: { list: resultsReply([]) },
    });
    await screen.findByRole('heading', { name: 'No contacts match the filters.' });
    expect((await axe(container)).violations).toEqual([]);
  });
});
