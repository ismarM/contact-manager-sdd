import { screen, waitFor, within } from '@testing-library/react';
import type { JsonBodyType } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import {
  contactDetail,
  contactSummary,
  filterOptionsReply,
  GROUP_ID,
  listQueries,
  renderContactsApp,
  resultsReply,
} from '../../test/contactsApi';
import { currentLocation } from '../../test/renderApp';
import { setViewport } from '../../test/viewport';

// Stanje seznama v naslovu strani (FR-008-08, FR-008-09; specs/008-iskanje/plan.md – Pages and routes): paginacija,
// ponastavitev strani, osvežitev, *Nazaj*/*Naprej*, deljena povezava, povezave na kontakt ohranijo poizvedbo.

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

const FULL =
  'q=novak&f=x.kompetenca%3Aweb&tag=vip&tag=konferenca2025&sort=email&dir=desc&size=50&page=2';

function urlParams() {
  return new URLSearchParams(window.location.search);
}

function app(path: string, options: Parameters<typeof renderContactsApp>[1] = {}) {
  return renderContactsApp(path, {
    role: 'VIEWER',
    ...options,
    contacts: {
      list: resultsReply([JANEZ, MOJCA], 312),
      filters: () => filterOptionsReply(['kompetenca'], ['vip', 'konferenca2025']),
      get: () => ({
        status: 200,
        body: contactDetail({ id: JANEZ.id }) as unknown as JsonBodyType,
      }),
      ...options.contacts,
    },
  });
}

async function area() {
  return within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
}

function pagination() {
  return screen.getByRole('navigation', { name: 'Strani rezultatov' });
}

describe('ContactListUrl', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('narrow');
  });

  it('FR-008-08: stran v naslovu je 1-osna, API dobi 0-osno stran in velikost', async () => {
    const { api } = app(`${PATH}?page=3&size=50`);

    await screen.findByRole('table', { name: TABLE });

    expect(listQueries(api)[0]).toMatchObject({ page: '2', size: '50' });
  });

  it('FR-008-08: 312 zadetkov in velikost 25 → »1–25 od 312« in »Stran 1 od 13«; velikost 100 → »1–100 od 312«', async () => {
    const { user } = app(PATH);
    await screen.findByRole('table', { name: TABLE });

    expect(within(pagination()).getByRole('status')).toHaveTextContent('1–25 od 312');
    expect(pagination()).toHaveTextContent('Stran 1 od 13');
    await user.selectOptions(
      within(pagination()).getByRole('combobox', { name: 'Velikost strani' }),
      '100',
    );

    await waitFor(() => expect(urlParams().get('size')).toBe('100'));
    expect(within(pagination()).getByRole('status')).toHaveTextContent('1–100 od 312');
    expect(pagination()).toHaveTextContent('Stran 1 od 4');
  });

  it('FR-008-08: sprememba strani ohrani iskanje, filtre in razvrstitev', async () => {
    const { api, user } = app(`${PATH}?q=novak&tag=vip&sort=email&dir=desc`);
    await screen.findByRole('table', { name: TABLE });

    await user.click(within(pagination()).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() => expect(urlParams().get('page')).toBe('2'));
    expect(urlParams().get('q')).toBe('novak');
    expect(urlParams().getAll('tag')).toEqual(['vip']);
    expect(urlParams().get('sort')).toBe('email');
    expect(urlParams().get('dir')).toBe('desc');
    expect(listQueries(api).at(-1)).toMatchObject({
      q: 'novak',
      tag: ['vip'],
      sort: 'email',
      dir: 'desc',
      page: '1',
    });
  });

  it('FR-008-08: sprememba velikosti strani ponastavi stran na 1', async () => {
    const { api, user } = app(`${PATH}?page=3`);
    await screen.findByRole('table', { name: TABLE });

    await user.selectOptions(
      within(pagination()).getByRole('combobox', { name: 'Velikost strani' }),
      '50',
    );

    await waitFor(() => expect(urlParams().get('page')).toBeNull());
    expect(listQueries(api).at(-1)).toMatchObject({ size: '50', page: '0' });
  });

  it('FR-008-08: sprememba iskalnega niza ponastavi stran na 1', async () => {
    const { api, user } = app(`${PATH}?page=3`);
    const search = await area();
    await screen.findByRole('table', { name: TABLE });

    await user.type(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' }), 'novak');

    await waitFor(() => expect(urlParams().get('q')).toBe('novak'));
    expect(urlParams().get('page')).toBeNull();
    expect(listQueries(api).at(-1)).toMatchObject({ q: 'novak', page: '0' });
  });

  it('FR-008-08: stran onkraj zadnje se zamenja z zadnjo obstoječo (13), zgodovina se ne podaljša', async () => {
    const { api } = app(`${PATH}?page=20`);
    const length = window.history.length;

    await waitFor(() => expect(urlParams().get('page')).toBe('13'));

    expect(window.history.length).toBe(length);
    await waitFor(() => expect(listQueries(api).at(-1)).toMatchObject({ page: '12' }));
    expect(within(pagination()).getByRole('status')).toHaveTextContent('301–312 od 312');
  });

  it('FR-008-09: deljena povezava pokaže enake oznake, razvrstitev, velikost in stran', async () => {
    const { api } = app(`${PATH}?${FULL}`);
    const search = await area();

    expect(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toHaveValue('novak');
    const list = search.getByRole('list', { name: 'Uporabljeni filtri' });
    expect(
      within(list).getByRole('button', { name: 'Odstrani filter kompetenca vsebuje web' }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'Odstrani filter Značka: vip' }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'Odstrani filter Značka: konferenca2025' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(search.getByRole('combobox', { name: 'Razvrsti' })).toHaveDisplayValue('E-naslov'),
    );
    expect(search.getByRole('button', { name: 'Smer razvrščanja: padajoče' })).toBeInTheDocument();
    expect(listQueries(api)[0]).toEqual({
      q: 'novak',
      f: ['x.kompetenca:web'],
      tag: ['vip', 'konferenca2025'],
      sort: 'email',
      dir: 'desc',
      page: '1',
      size: '50',
    });
  });

  it('FR-008-09: osvežitev strani (nov izris iz istega naslova) pokaže isto stanje', async () => {
    const first = app(`${PATH}?${FULL}`);
    await area();
    const location = currentLocation();
    const firstRequest = listQueries(first.api)[0];
    first.unmount();

    const second = app(location);
    const search = await area();

    expect(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toHaveValue('novak');
    expect(search.getByRole('button', { name: 'Filtri (3)' })).toBeInTheDocument();
    expect(currentLocation()).toBe(location);
    expect(listQueries(second.api)[0]).toEqual(firstRequest);
  });

  it('FR-008-09: neveljavna stanja v naslovu postanejo privzeta brez napake', async () => {
    const { api } = app(`${PATH}?page=abc&size=7&sort=foo&dir=up&nekaj=drugo`);

    await screen.findByRole('table', { name: TABLE });

    expect(listQueries(api)[0]).toMatchObject({ page: '0', size: '25', q: null, f: [], tag: [] });
  });

  it('FR-008-09: *Nazaj* in *Naprej* obnovita razvrstitev in velikost strani', async () => {
    const { user } = app(PATH);
    const search = await area();
    await screen.findByRole('table', { name: TABLE });
    await user.click(search.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }));
    await waitFor(() => expect(urlParams().get('dir')).toBe('desc'));
    await user.selectOptions(
      within(pagination()).getByRole('combobox', { name: 'Velikost strani' }),
      '50',
    );
    await waitFor(() => expect(urlParams().get('size')).toBe('50'));

    window.history.back();
    await waitFor(() => expect(urlParams().get('size')).toBeNull());
    expect(urlParams().get('dir')).toBe('desc');
    expect(search.getByRole('button', { name: 'Smer razvrščanja: padajoče' })).toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(urlParams().get('dir')).toBeNull());
    expect(
      search.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }),
    ).toBeInTheDocument();

    window.history.forward();
    await waitFor(() => expect(urlParams().get('dir')).toBe('desc'));
  });

  it('FR-008-09: *Nazaj* po čiščenju filtrov vrne iskalno polje in oznake', async () => {
    const { user } = app(`${PATH}?q=novak&tag=vip`);
    const search = await area();
    await screen.findByRole('table', { name: TABLE });
    await user.click(search.getByRole('button', { name: 'Počisti filtre' }));
    await waitFor(() => expect(urlParams().get('q')).toBeNull());
    expect(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toHaveValue('');

    window.history.back();

    await waitFor(() => expect(urlParams().get('q')).toBe('novak'));
    await waitFor(() =>
      expect(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toHaveValue('novak'),
    );
    expect(search.getByRole('button', { name: 'Odstrani filter Značka: vip' })).toBeInTheDocument();
  });

  it('FR-008-09 (M1): povezava z značko, ki je v skupini ni (več), pokaže prazno stanje, oznaka ostane odstranljiva', async () => {
    const { user } = app(`${PATH}?tag=izbrisana`, {
      contacts: { list: resultsReply([], 0) },
    });

    expect(
      await screen.findByRole('heading', { name: 'Ni kontaktov, ki ustrezajo filtrom.' }),
    ).toBeInTheDocument();
    const search = await area();
    await user.click(search.getByRole('button', { name: 'Odstrani filter Značka: izbrisana' }));

    await waitFor(() => expect(urlParams().getAll('tag')).toEqual([]));
  });

  it('FR-008-09: povezava na kontakt in povratek ohranita celotno poizvedbo seznama', async () => {
    const { user } = app(`${PATH}?${FULL}`, { contacts: { list: resultsReply([JANEZ], 312) } });
    await screen.findByRole('table', { name: TABLE });

    const link = screen.getByRole('link', { name: 'Janez Novak' });
    const target = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(target.pathname).toBe(`${PATH}/${JANEZ.id}`);
    expect(Object.fromEntries(target.searchParams)).toMatchObject({
      q: 'novak',
      sort: 'email',
      dir: 'desc',
      size: '50',
      page: '2',
    });
    expect(target.searchParams.getAll('tag')).toEqual(['vip', 'konferenca2025']);
    expect(target.searchParams.getAll('f')).toEqual(['x.kompetenca:web']);
    await user.click(link);

    const back = await screen.findByRole('link', { name: 'Nazaj na seznam kontaktov' });
    const returnTo = new URL(back.getAttribute('href') ?? '', 'http://x');
    expect(returnTo.pathname).toBe(PATH);
    expect(returnTo.searchParams.get('q')).toBe('novak');
    expect(returnTo.searchParams.getAll('tag')).toEqual(['vip', 'konferenca2025']);
    expect(returnTo.searchParams.get('sort')).toBe('email');
    expect(returnTo.searchParams.get('page')).toBe('2');
    await user.click(back);

    const search = await area();
    expect(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toHaveValue('novak');
    expect(urlParams().get('page')).toBe('2');
  });

  it('FR-008-09: *Nazaj* iz pogleda kontakta vrne isto stanje seznama', async () => {
    const { user } = app(`${PATH}?${FULL}`, { contacts: { list: resultsReply([JANEZ], 312) } });
    await screen.findByRole('table', { name: TABLE });
    const before = currentLocation();
    await user.click(screen.getByRole('link', { name: 'Janez Novak' }));
    await screen.findByRole('link', { name: 'Nazaj na seznam kontaktov' });

    window.history.back();

    await waitFor(() => expect(currentLocation()).toBe(before));
    expect((await area()).getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toHaveValue(
      'novak',
    );
  });

  it('FR-008-09: v panelu (≥ 1280 px) ostane izbrani kontakt izbran ob spremembi filtra, »Zapri podrobnosti« ohrani poizvedbo', async () => {
    setViewport('panel');
    const { user } = app(`${PATH}/${JANEZ.id}?q=novak&sort=email`, {
      contacts: { list: resultsReply([JANEZ], 1) },
    });
    const search = await area();
    await screen.findByRole('region', { name: 'Podrobnosti kontakta' });

    await user.click(search.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }));

    await waitFor(() => expect(urlParams().get('dir')).toBe('desc'));
    expect(window.location.pathname).toBe(`${PATH}/${JANEZ.id}`);
    expect(screen.getByRole('region', { name: 'Podrobnosti kontakta' })).toBeInTheDocument();
    const close = screen.getByRole('link', { name: 'Zapri podrobnosti' });
    const closeTarget = new URL(close.getAttribute('href') ?? '', 'http://x');
    expect(closeTarget.pathname).toBe(PATH);
    expect(closeTarget.searchParams.get('q')).toBe('novak');
    expect(closeTarget.searchParams.get('dir')).toBe('desc');
  });
});
