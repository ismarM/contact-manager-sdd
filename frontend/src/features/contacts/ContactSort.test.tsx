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
} from '../../test/contactsApi';

// Razvrščanje seznama (FR-008-07; specs/008-iskanje/plan.md – Key elements): izbira »Razvrsti«, gumb smeri in gumbi v
// glavah stolpcev. Vrstni red zadetkov določa strežnik; test preverja stanje, naslov in zahtevke.

const PATH = `/groups/${GROUP_ID}/contacts`;

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
      list: resultsReply([JANEZ, MOJCA], 200),
      filters: () => filterOptionsReply(['kompetenca', 'podjetje'], ['vip']),
      ...options.contacts,
    },
  });
}

async function area() {
  return within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
}

function header(name: string) {
  return screen.getByRole('columnheader', { name });
}

describe('ContactSort', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-008-07: izbira »Razvrsti« ponuja predefinirana polja in ključe skupine', async () => {
    app(PATH);
    const search = await area();

    const select = search.getByRole('combobox', { name: 'Razvrsti' });

    await waitFor(() =>
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Priimek', 'Ime', 'Naslov', 'E-naslov', 'Telefon', 'kompetenca', 'podjetje']),
    );
    expect(select).toHaveDisplayValue('Priimek');
  });

  it('FR-008-07: izbira polja zapiše sort v naslov in pošlje zahtevek, privzeto polje ga odstrani', async () => {
    const { api, user } = app(PATH);
    const search = await area();
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    await waitFor(() =>
      expect(
        within(search.getByRole('combobox', { name: 'Razvrsti' })).getAllByRole('option'),
      ).toHaveLength(7),
    );

    await user.selectOptions(search.getByRole('combobox', { name: 'Razvrsti' }), 'E-naslov');
    await waitFor(() => expect(urlParams().get('sort')).toBe('email'));
    expect(listQueries(api).at(-1)).toMatchObject({ sort: 'email' });

    await user.selectOptions(search.getByRole('combobox', { name: 'Razvrsti' }), 'kompetenca');
    await waitFor(() => expect(urlParams().get('sort')).toBe('x.kompetenca'));
    expect(listQueries(api).at(-1)).toMatchObject({ sort: 'x.kompetenca' });

    await user.selectOptions(search.getByRole('combobox', { name: 'Razvrsti' }), 'Priimek');
    await waitFor(() => expect(urlParams().get('sort')).toBeNull());
  });

  it('FR-008-07: gumb smeri obrne smer; ime gumba pove trenutno smer; privzeta smer ni v naslovu', async () => {
    const { api, user } = app(PATH);
    const search = await area();
    const button = search.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' });
    expect(urlParams().get('dir')).toBeNull();

    await user.click(button);

    await waitFor(() => expect(urlParams().get('dir')).toBe('desc'));
    expect(search.getByRole('button', { name: 'Smer razvrščanja: padajoče' })).toBeInTheDocument();
    expect(listQueries(api).at(-1)).toMatchObject({ dir: 'desc' });
    await user.click(search.getByRole('button', { name: 'Smer razvrščanja: padajoče' }));
    await waitFor(() => expect(urlParams().get('dir')).toBeNull());
  });

  it('FR-008-07: glave »Ime in priimek«, »E-naslov«, »Telefon« imajo gumb in aria-sort', async () => {
    const { user } = app(PATH);
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });

    expect(header('Ime in priimek')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('E-naslov')).toHaveAttribute('aria-sort', 'none');
    expect(header('Telefon')).toHaveAttribute('aria-sort', 'none');

    await user.click(within(header('E-naslov')).getByRole('button'));
    await waitFor(() => expect(urlParams().get('sort')).toBe('email'));
    expect(urlParams().get('dir')).toBeNull();
    expect(header('E-naslov')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Ime in priimek')).toHaveAttribute('aria-sort', 'none');

    await user.click(within(header('E-naslov')).getByRole('button'));
    await waitFor(() => expect(urlParams().get('dir')).toBe('desc'));
    expect(header('E-naslov')).toHaveAttribute('aria-sort', 'descending');

    await user.click(within(header('Telefon')).getByRole('button'));
    await waitFor(() => expect(urlParams().get('sort')).toBe('phone'));
    expect(urlParams().get('dir')).toBeNull();
    expect(header('Telefon')).toHaveAttribute('aria-sort', 'ascending');

    await user.click(within(header('Ime in priimek')).getByRole('button'));
    await waitFor(() => expect(urlParams().get('sort')).toBeNull());
    expect(header('Ime in priimek')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('FR-008-07: »Značke« in »Dejanja« nista razvrstljivi, imena glav iz 004 ostanejo', async () => {
    app(PATH, { role: 'EDITOR' });
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });

    expect(within(header('Ime in priimek')).getByRole('button')).toBeInTheDocument();
    expect(within(header('Značke')).queryByRole('button')).not.toBeInTheDocument();
    expect(header('Značke')).not.toHaveAttribute('aria-sort');
    const names = within(screen.getByRole('table', { name: 'Kontakti skupine Projekt FERI' }))
      .getAllByRole('columnheader')
      .map((columnheader) => columnheader.textContent);
    expect(names).toEqual(['Ime in priimek', 'E-naslov', 'Telefon', 'Značke', 'Dejanja']);
  });

  it('FR-008-07: razvrščanje po dodatnem ključu iz naslova je izbrano v izbiri in zapisano v zahtevku', async () => {
    const { api } = app(`${PATH}?sort=x.podjetje&dir=desc`);
    const search = await area();

    await waitFor(() =>
      expect(search.getByRole('combobox', { name: 'Razvrsti' })).toHaveDisplayValue('podjetje'),
    );
    expect(search.getByRole('button', { name: 'Smer razvrščanja: padajoče' })).toBeInTheDocument();
    await waitFor(() =>
      expect(listQueries(api)[0]).toMatchObject({ sort: 'x.podjetje', dir: 'desc' }),
    );
  });

  it('FR-008-07 FR-008-08: razvrščanje ponastavi stran na 1', async () => {
    const { api, user } = app(`${PATH}?page=3`);
    const search = await area();
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });

    await user.click(search.getByRole('button', { name: 'Smer razvrščanja: naraščajoče' }));

    await waitFor(() => expect(urlParams().get('page')).toBeNull());
    expect(listQueries(api).at(-1)).toMatchObject({ dir: 'desc', page: '0' });
  });

  it('FR-008-07: izbira in smer razvrščanja sta v območju iskanja, torej neodvisna od glav stolpcev', async () => {
    app(PATH);

    const search = await area();

    expect(search.getByRole('combobox', { name: 'Razvrsti' })).toBeVisible();
    expect(search.getByRole('button', { name: /^Smer razvrščanja/ })).toBeVisible();
  });

  it('FR-008-07: brez kršitev axe (sl in en)', async () => {
    const { container } = app(`${PATH}?sort=email&dir=desc`, { role: 'EDITOR' });
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    await screen.findByRole('combobox', { name: 'Sort by' });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-008-07: v angleščini sta imeni »Sort by« in »Sort direction: ascending«', async () => {
    await i18n.changeLanguage('en');
    app(PATH);
    const search = within(await screen.findByRole('search', { name: 'Search and filters' }));

    expect(search.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    expect(search.getByRole('button', { name: 'Sort direction: ascending' })).toBeInTheDocument();
  });
});
