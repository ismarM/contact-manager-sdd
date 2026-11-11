import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  contactSummary,
  filterOptionsReply,
  GROUP_ID,
  listQueries,
  renderContactsApp,
  resultsReply,
  validationFailedReply,
} from '../../test/contactsApi';

// Napake, neveljavni parametri in arhivirane skupine (FR-008-14, FR-008-15, FR-008-17; specs/008-iskanje/plan.md –
// Key elements). Prejšnja vsebina seznama ostane ob napaki osvežitve.

const PATH = `/groups/${GROUP_ID}/contacts`;
const TABLE = 'Kontakti skupine Projekt FERI';

const JANEZ = contactSummary(1, { displayName: 'Janez Novak' });
const MOJCA = contactSummary(2, { displayName: 'Mojca Kralj' });

function urlParams() {
  return new URLSearchParams(window.location.search);
}

function app(path: string, options: Parameters<typeof renderContactsApp>[1] = {}) {
  return renderContactsApp(path, {
    role: 'VIEWER',
    ...options,
    contacts: {
      list: resultsReply([JANEZ, MOJCA]),
      filters: () => filterOptionsReply(['kompetenca'], ['vip']),
      ...options.contacts,
    },
  });
}

async function area() {
  return within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
}

describe('ContactSearchErrors', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-008-14: 400 VALIDATION_FAILED pokaže »Filtri niso veljavni.« z gumbom »Počisti filtre«, ki počisti naslov', async () => {
    const { api, user } = app(`${PATH}?f=x.skrivno%3Aabc&tag=vip`, {
      contacts: {
        list: (url) =>
          url.searchParams.has('f')
            ? validationFailedReply({ field: 'f[0]', code: 'UNKNOWN_FIELD' })
            : resultsReply([JANEZ, MOJCA])(url),
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Filtri niso veljavni.');
    expect(alert).not.toHaveTextContent('VALIDATION_FAILED');
    expect(alert).not.toHaveTextContent('UNKNOWN_FIELD');
    // v `main` je gumb v praznem stanju/opozorilu zadnji (ob oznakah je prvi, v območju iskanja)
    const clear = within(screen.getByRole('main')).getAllByRole('button', {
      name: 'Počisti filtre',
    });
    await user.click(clear.at(-1) as HTMLElement);

    expect(await screen.findByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(urlParams().getAll('f')).toEqual([]);
    expect(urlParams().getAll('tag')).toEqual([]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listQueries(api).at(-1)).toMatchObject({ f: [], tag: [] });
  });

  it('FR-008-14: 400 zaradi predolgega iskalnega niza pokaže isto sporočilo', async () => {
    app(`${PATH}?q=${'a'.repeat(201)}`, {
      contacts: { list: () => validationFailedReply({ field: 'q', code: 'TOO_LONG' }) },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Filtri niso veljavni.');
  });

  it('FR-008-17: napaka med osvežitvijo pokaže opozorilo nad prejšnjo vsebino, »Poskusi znova« ponovi isto poizvedbo', async () => {
    let failures = 1;
    const { api, user } = app(PATH, {
      contacts: {
        list: (url) => {
          if (url.searchParams.get('q') === 'x' && failures > 0) {
            failures -= 1;
            return { status: 500 };
          }
          return url.searchParams.get('q') === 'x'
            ? resultsReply([MOJCA])(url)
            : resultsReply([JANEZ, MOJCA])(url);
        },
      },
    });
    const search = await area();
    await screen.findByRole('table', { name: TABLE });

    await user.type(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' }), 'x');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kontaktov ni bilo mogoče naložiti. Poskusi znova.');
    expect(screen.getByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mojca Kralj' })).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Janez Novak' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mojca Kralj' })).toBeInTheDocument();
    const queries = listQueries(api).filter((query) => query.q === 'x');
    expect(queries).toHaveLength(2);
    expect(queries[1]).toEqual(queries[0]);
  });

  it('FR-008-17: omrežna napaka ima enak potek kot napaka strežnika', async () => {
    const { user } = app(PATH, {
      contacts: {
        list: (url) =>
          url.searchParams.get('q') === 'x' ? 'network-error' : resultsReply([JANEZ])(url),
      },
    });
    const search = await area();
    await screen.findByRole('table', { name: TABLE });

    await user.type(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' }), 'x');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kontaktov ni bilo mogoče naložiti.',
    );
    expect(screen.getByRole('link', { name: 'Janez Novak' })).toBeInTheDocument();
  });

  it('FR-008-17: začetna napaka brez prejšnje vsebine pokaže opozorilo brez preglednice', async () => {
    app(PATH, { contacts: { list: () => ({ status: 500 }) } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kontaktov ni bilo mogoče naložiti.',
    );
    expect(screen.queryByRole('table', { name: TABLE })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poskusi znova' })).toBeInTheDocument();
  });

  it('FR-008-14: 404 pokaže stran »Te strani ni«', async () => {
    app(PATH, { contacts: { list: () => ({ status: 404 }) } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
  });

  it.each(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const)(
    'FR-008-15: v arhivirani skupini (%s) iskanje, filtri in razvrščanje delujejo brez akcij urejanja',
    async (role) => {
      const { api, user } = app(PATH, { role, archived: true });
      const search = await area();
      await screen.findByRole('table', { name: TABLE });

      await user.type(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' }), 'novak');
      await waitFor(() => expect(listQueries(api).at(-1)?.q).toBe('novak'));
      await user.click(search.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }));
      await waitFor(() => expect(listQueries(api).at(-1)?.dir).toBe('desc'));
      await user.click(search.getByRole('button', { name: /^Filtri/ }));
      expect(await screen.findByRole('group', { name: 'Filtri kontaktov' })).toBeInTheDocument();

      expect(screen.queryByRole('link', { name: 'Nov kontakt' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Dejanja za / })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('FR-008-15: bralec in urednik vidita enako orodno vrstico', async () => {
    app(PATH, { role: 'VIEWER' });
    const viewer = await area();
    expect(viewer.getByRole('searchbox', { name: 'Iskanje po kontaktih' })).toBeInTheDocument();
    expect(viewer.getByRole('button', { name: 'Filtri' })).toBeInTheDocument();
    expect(viewer.getByRole('combobox', { name: 'Razvrsti' })).toBeInTheDocument();
    expect(
      viewer.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }),
    ).toBeInTheDocument();
  });

  it('FR-008-14: brez kršitev axe v stanjih neveljavnih filtrov in napake (sl)', async () => {
    const invalid = app(`${PATH}?f=x.skrivno%3Aabc`, {
      contacts: { list: () => validationFailedReply({ field: 'f[0]', code: 'UNKNOWN_FIELD' }) },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Filtri niso veljavni.');
    expect((await axe(invalid.container)).violations).toEqual([]);
  });

  it('FR-008-17: brez kršitev axe v stanju napake pri osvežitvi (en)', async () => {
    await i18n.changeLanguage('en');
    const { container, user } = app(PATH, {
      contacts: {
        list: (url) =>
          url.searchParams.get('q') === 'x' ? { status: 500 } : resultsReply([JANEZ])(url),
      },
    });
    const search = within(await screen.findByRole('search', { name: 'Search and filters' }));
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    await user.type(search.getByRole('searchbox', { name: 'Search contacts' }), 'x');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Contacts could not be loaded. Please try again.',
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
