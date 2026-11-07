import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  contactPageReply,
  contactSummaries,
  contactSummary,
  GROUP_ID,
  renderContactsApp,
} from '../../test/contactsApi';

// Seznam kontaktov skupine (FR-004-06, FR-004-07, FR-004-16; plan.md – Key elements; design.md 8.6, 8.9, 8.15, 9.3).

const PATH = `/groups/${GROUP_ID}/contacts`;
const TABLE = 'Kontakti skupine Projekt FERI';

/** Pot in parametri poizvedbe brez odvisnosti od njihovega vrstnega reda. */
function location() {
  return {
    path: window.location.pathname,
    query: Object.fromEntries(new URLSearchParams(window.location.search)),
  };
}

async function findTable() {
  return screen.findByRole('table', { name: TABLE });
}

describe('ContactsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-06: bralec vidi preglednico s stolpci, 25 vrstic in obseg »1–25 od 60«; naslov strani', async () => {
    const { api } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: contactPageReply(contactSummaries(60)) },
    });

    const table = await findTable();
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Ime in priimek', 'E-naslov', 'Telefon', 'Značke']);
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('heading', { level: 2, name: 'Kontakti' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: TABLE })).toHaveAttribute('tabindex', '0');
    const connections = within(screen.getByRole('navigation', { name: 'Razdelki skupine' }));
    expect(connections.getByRole('link', { name: 'Kontakti' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Strani rezultatov' })).getByRole('status'),
    ).toHaveTextContent('1–25 od 60');
    await waitFor(() => expect(document.title).toBe('Kontakti – Projekt FERI – Kontakti'));
    const request = api.of('GET', `/api/groups/${GROUP_ID}/contacts`).at(0);
    expect(request?.search.get('page')).toBe('0');
    expect(request?.search.get('size')).toBe('25');
  });

  it('FR-004-06: vrstica ima ime kot povezavo na kontakt, e-naslov in telefon', async () => {
    renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        list: contactPageReply([
          contactSummary(1, {
            displayName: 'Janez Novak',
            email: 'janez@primer.si',
            phone: '01 234 567',
          }),
        ]),
      },
    });

    const table = await findTable();
    const row = within(table).getByRole('row', { name: /Janez Novak/ });
    expect(within(row).getByRole('rowheader')).toHaveTextContent('Janez Novak');
    expect(within(row).getByRole('link', { name: 'Janez Novak' })).toHaveAttribute(
      'href',
      expect.stringMatching(new RegExp(`^/groups/${GROUP_ID}/contacts/[0-9a-f-]{36}`)),
    );
    expect(row).toHaveTextContent('janez@primer.si');
    expect(row).toHaveTextContent('01 234 567');
  });

  it('FR-004-06: kontakt s petimi značkami pokaže prve tri in »+2«', async () => {
    renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        list: contactPageReply([
          contactSummary(1, { tags: ['a1', 'b2', 'c3', 'd4', 'e5'] }),
          contactSummary(2, { tags: ['x1'] }),
        ]),
      },
    });

    const table = await findTable();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('a1');
    expect(rows[0]).toHaveTextContent('b2');
    expect(rows[0]).toHaveTextContent('c3');
    expect(rows[0]).toHaveTextContent('+2');
    expect(rows[0]).not.toHaveTextContent('d4');
    expect(rows[0]).not.toHaveTextContent('e5');
    expect(rows[1]).toHaveTextContent('x1');
    expect(rows[1]).not.toHaveTextContent('+');
  });

  it('FR-004-06: velikost strani 50 in naslednja stran – stran in velikost sta v naslovu poti', async () => {
    const { user, api } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: contactPageReply(contactSummaries(60)) },
    });
    await findTable();
    // Element se poišče znova po vsakem branju (med nalaganjem ga sme vmesnik začasno zamenjati).
    const pagination = () => screen.getByRole('navigation', { name: 'Strani rezultatov' });

    await user.selectOptions(
      within(pagination()).getByRole('combobox', { name: 'Velikost strani' }),
      '50',
    );
    await waitFor(() => expect(location()).toEqual({ path: PATH, query: { size: '50' } }));
    await waitFor(() =>
      expect(within(pagination()).getByRole('status')).toHaveTextContent('1–50 od 60'),
    );
    await user.click(within(pagination()).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() =>
      expect(location()).toEqual({ path: PATH, query: { page: '2', size: '50' } }),
    );
    await waitFor(() =>
      expect(within(pagination()).getByRole('status')).toHaveTextContent('51–60 od 60'),
    );
    expect(within(await findTable()).getAllByRole('row')).toHaveLength(11);
    const request = api.of('GET', `/api/groups/${GROUP_ID}/contacts`).at(-1);
    expect(request?.search.get('page')).toBe('1');
    expect(request?.search.get('size')).toBe('50');
    expect(within(pagination()).getByRole('button', { name: 'Naslednja' })).toBeDisabled();
  });

  it('FR-004-06: osvežitev (nov izris na isti poti) ohrani stran in velikost', async () => {
    const { api } = renderContactsApp(`${PATH}?page=2&size=50`, {
      role: 'VIEWER',
      contacts: { list: contactPageReply(contactSummaries(60)) },
    });

    const table = await findTable();
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(
      within(screen.getByRole('navigation', { name: 'Strani rezultatov' })).getByRole('status'),
    ).toHaveTextContent('51–60 od 60');
    const request = api.of('GET', `/api/groups/${GROUP_ID}/contacts`).at(0);
    expect(request?.search.get('page')).toBe('1');
    expect(request?.search.get('size')).toBe('50');
  });

  it('FR-004-06: stran onkraj zadnje prikaže zadnjo obstoječo stran', async () => {
    renderContactsApp(`${PATH}?page=9`, {
      role: 'VIEWER',
      contacts: { list: contactPageReply(contactSummaries(60)) },
    });

    await waitFor(() => expect(location()).toEqual({ path: PATH, query: { page: '3' } }));
    await findTable();
    await waitFor(() =>
      expect(within(screen.getByRole('table', { name: TABLE })).getAllByRole('row')).toHaveLength(
        11,
      ),
    );
  });

  it('FR-004-06: po menjavi strani je fokus na naslovu seznama', async () => {
    const { user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: contactPageReply(contactSummaries(60)) },
    });
    await findTable();

    await user.click(
      within(screen.getByRole('navigation', { name: 'Strani rezultatov' })).getByRole('button', {
        name: 'Naslednja',
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Kontakti' })).toHaveFocus(),
    );
  });

  it('FR-004-07: prazna skupina – urednik vidi razlago in povezavo Nov kontakt', async () => {
    renderContactsApp(PATH, { role: 'EDITOR' });

    const main = await screen.findByRole('main');
    expect(
      await within(main).findByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' }),
    ).toBeInTheDocument();
    const links = within(main).getAllByRole('link', { name: 'Nov kontakt' });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute('href', `${PATH}/new`));
    expect(within(main).queryByRole('table')).not.toBeInTheDocument();
  });

  it.each([
    ['bralec', { role: 'VIEWER' as const, archived: false }],
    ['lastnik arhivirane skupine', { role: 'OWNER' as const, archived: true }],
    ['urednik arhivirane skupine', { role: 'EDITOR' as const, archived: true }],
  ])('FR-004-07: prazna skupina – %s vidi samo razlago, brez gumba', async (_name, options) => {
    renderContactsApp(PATH, options);

    const main = await screen.findByRole('main');
    expect(
      await within(main).findByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' }),
    ).toBeInTheDocument();
    expect(within(main).queryByRole('link', { name: 'Nov kontakt' })).not.toBeInTheDocument();
  });

  it('FR-004-06: med nalaganjem je status »Nalagam…«', async () => {
    renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { list: () => new Promise(() => undefined) },
    });

    await screen.findByRole('heading', { level: 1, name: 'Projekt FERI' });
    expect(await within(screen.getByRole('main')).findByRole('status')).toHaveTextContent(
      'Nalagam…',
    );
  });

  it('FR-004-16: napaka nalaganja je trajno sporočilo; Poskusi znova ponovi zahtevek', async () => {
    let fail = true;
    const { user, api } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        list: (url) =>
          fail
            ? { status: 500, body: { code: 'INTERNAL' } }
            : contactPageReply(contactSummaries(2))(url),
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kontaktov ni bilo mogoče naložiti. Poskusi znova.');
    expect(alert).not.toHaveTextContent('INTERNAL');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(await findTable()).toBeInTheDocument();
    expect(api.of('GET', `/api/groups/${GROUP_ID}/contacts`)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-004-14: nečlan ali neobstoječa skupina na poti kontaktov – »Te strani ni« brez podatkov', async () => {
    renderContactsApp(PATH, {
      groups: { get: () => ({ status: 404 }) },
      contacts: { list: contactPageReply(contactSummaries(3)) },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveTextContent('Ime001');
  });

  it('FR-004-06: brez kršitev axe (sl, urednik, 60 kontaktov)', async () => {
    const { container } = renderContactsApp(PATH, {
      role: 'EDITOR',
      contacts: { list: contactPageReply(contactSummaries(60)) },
    });
    await findTable();

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-004-07: brez kršitev axe v praznem stanju (urednik)', async () => {
    const { container } = renderContactsApp(PATH, { role: 'EDITOR' });
    await screen.findByRole('heading', { level: 3, name: 'Ta skupina še nima kontaktov.' });

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-004-06: angleški vmesnik – imena iz plana in brez kršitev axe', async () => {
    await i18n.changeLanguage('en');
    const { container } = renderContactsApp(PATH, {
      role: 'EDITOR',
      contacts: { list: contactPageReply(contactSummaries(30)) },
    });

    const table = await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Name', 'Email', 'Phone', 'Tags', 'Actions']);
    expect(screen.getByRole('link', { name: 'New contact' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Result pages' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Contacts – Projekt FERI – Contacts'));
    expect((await axe(container)).violations).toEqual([]);
  });
});
