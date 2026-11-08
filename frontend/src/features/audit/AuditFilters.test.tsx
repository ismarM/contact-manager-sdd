import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { auditEntries, auditPageReply, GROUP_ID, renderAuditApp } from '../../test/auditApi';
import { CONTACT_ID } from '../../test/contactsApi';

// Filtri sledi v poti (FR-005-09, FR-005-10; design.md 8.7): vrsta dejanja (ponovljen action) in kontakt.

const PATH = `/groups/${GROUP_ID}/audit`;
const LIST_API = `/api/groups/${GROUP_ID}/audit`;
/** 40 vnosov, vrste dejanj se izmenjujejo (UPDATE, CREATE, DELETE). */
const ALL = auditEntries(40);

function render(path = PATH, options: Parameters<typeof auditPageReply>[1] = {}) {
  return renderAuditApp(path, {
    role: 'VIEWER',
    handlers: { list: auditPageReply(ALL, options) },
  });
}

const search = () => new URLSearchParams(window.location.search);

describe('AuditFilters', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-005-09: gumb Filtri odpre in zapre panel z vrstami dejanj', async () => {
    const { user } = render();
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

    const toggle = screen.getByRole('button', { name: 'Filtri' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const group = screen.getByRole('group', { name: 'Vrsta dejanja' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(5);
    for (const name of ['dodajanje', 'urejanje', 'odstranjevanje', 'združevanje', 'rollback']) {
      expect(within(group).getByRole('checkbox', { name })).not.toBeChecked();
    }
    expect(screen.getByRole('button', { name: 'Uporabi filtre' })).toBeInTheDocument();
  });

  it('FR-005-09: izbira vrste in Uporabi filtre zapišeta action v pot, naložita stran 1 in pokažeta oznako', async () => {
    const { user, api } = render();
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

    await user.click(screen.getByRole('button', { name: 'Filtri' }));
    await user.click(screen.getByRole('checkbox', { name: 'odstranjevanje' }));
    await user.click(screen.getByRole('button', { name: 'Uporabi filtre' }));

    await waitFor(() => expect(window.location.search).toBe('?action=DELETE'));
    await waitFor(() =>
      expect(api.of('GET', LIST_API).at(-1)?.search.getAll('action')).toEqual(['DELETE']),
    );
    expect(api.of('GET', LIST_API).at(-1)?.search.get('page')).toBe('0');
    expect(await screen.findByRole('button', { name: 'Filtri (1)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Odstrani filter Vrsta: odstranjevanje' }),
    ).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Vnosi revizijske sledi' })).getAllByRole(
      'listitem',
    );
    for (const item of items) expect(item).toHaveTextContent('izbrisal(a)');
  });

  it('FR-005-09: dve vrsti se v poti ponovita kot action=…&action=…', async () => {
    const { user, api } = render();
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

    await user.click(screen.getByRole('button', { name: 'Filtri' }));
    await user.click(screen.getByRole('checkbox', { name: 'odstranjevanje' }));
    await user.click(screen.getByRole('checkbox', { name: 'urejanje' }));
    await user.click(screen.getByRole('button', { name: 'Uporabi filtre' }));

    await waitFor(() => expect(search().getAll('action').sort()).toEqual(['DELETE', 'UPDATE']));
    await waitFor(() =>
      expect(api.of('GET', LIST_API).at(-1)?.search.getAll('action').sort()).toEqual([
        'DELETE',
        'UPDATE',
      ]),
    );
    expect(await screen.findByRole('button', { name: 'Filtri (2)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Odstrani filter Vrsta: urejanje' }),
    ).toBeInTheDocument();
  });

  it('FR-005-09: osvežitev ohrani filtre in stran (izris na ?action=DELETE&page=2)', async () => {
    const { api } = render(`${PATH}?action=DELETE&page=2`);

    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    expect(api.of('GET', LIST_API)[0]?.search.getAll('action')).toEqual(['DELETE']);
    expect(api.of('GET', LIST_API)[0]?.search.get('page')).toBe('1');
    expect(screen.getByRole('button', { name: 'Filtri (1)' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Odstrani filter Vrsta: odstranjevanje' });
  });

  it('FR-005-09: odstranitev oznake odstrani filter iz poti', async () => {
    const { user, api } = render(`${PATH}?action=DELETE`);
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

    await user.click(screen.getByRole('button', { name: 'Odstrani filter Vrsta: odstranjevanje' }));

    await waitFor(() => expect(window.location.search).toBe(''));
    await waitFor(() =>
      expect(api.of('GET', LIST_API).at(-1)?.search.getAll('action')).toEqual([]),
    );
    expect(screen.getByRole('button', { name: 'Filtri' })).toBeInTheDocument();
  });

  it('FR-005-09: filter po kontaktu – zahtevek s contact in oznaka z imenom iz odgovora', async () => {
    const { api } = render(`${PATH}?contact=${CONTACT_ID}`, {
      contactFilter: { id: CONTACT_ID, displayName: 'Janez Novak' },
    });

    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    expect(api.of('GET', LIST_API)[0]?.search.get('contact')).toBe(CONTACT_ID);
    expect(
      screen.getByRole('button', { name: 'Odstrani filter Kontakt: Janez Novak' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtri (1)' })).toBeInTheDocument();
  });

  it('FR-005-09: kontakt brez imena je »neznan kontakt«; odstranitev oznake odstrani contact iz poti', async () => {
    const { user } = render(`${PATH}?contact=${CONTACT_ID}`, {
      contactFilter: { id: CONTACT_ID, displayName: null },
    });
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

    await user.click(
      screen.getByRole('button', { name: 'Odstrani filter Kontakt: neznan kontakt' }),
    );

    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('FR-005-10: filtri brez zadetkov – prazno stanje in Počisti filtre', async () => {
    const { user } = renderAuditApp(`${PATH}?action=MERGE`, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(ALL) },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Ni vnosov, ki ustrezajo filtrom.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Počisti filtre' }));

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await screen.findByRole('list', { name: 'Vnosi revizijske sledi' })).toBeInTheDocument();
  });

  it('FR-005-09: neveljavna vrednost action v poti se prezre', async () => {
    const { api } = render(`${PATH}?action=FOO&action=DELETE`);

    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    expect(api.of('GET', LIST_API)[0]?.search.getAll('action')).toEqual(['DELETE']);
  });

  it('FR-005-09: filtri v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { user } = render(`${PATH}?action=DELETE`);
    await screen.findByRole('list', { name: 'Audit trail entries' });

    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove filter Action: deleted' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters (1)' }));
    const group = screen.getByRole('group', { name: 'Action type' });
    expect(within(group).getByRole('checkbox', { name: 'deleted' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Apply filters' })).toBeInTheDocument();
  });

  it('FR-005-09: odprt panel filtrov brez kršitev axe', async () => {
    const { user, container } = render(`${PATH}?action=DELETE`);
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

    await user.click(screen.getByRole('button', { name: 'Filtri (1)' }));

    expect((await axe(container)).violations).toEqual([]);
  });
});
