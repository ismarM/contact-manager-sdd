import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  auditEntry,
  auditPageReply,
  changePageReply,
  contactChange,
  entryId,
  GROUP_ID,
  renderAuditApp,
  summaryOf,
} from '../../test/auditApi';
import { contactId } from '../../test/contactsApi';

// Podrobnosti vnosa: prizadeti kontakti in spremenjena polja (FR-005-02, -08, -18; Clarifications 2026-11-08, Q3).

const PATH = `/groups/${GROUP_ID}/audit`;
const ENTRY = entryId(1);
const CHANGES_API = `/api/groups/${GROUP_ID}/audit/${ENTRY}/changes`;

const EDIT_CHANGES = [
  contactChange({
    fields: [
      { field: 'PHONE', key: null, before: '01 234 5678', after: '031 123 456' },
      { field: 'ATTRIBUTE', key: 'kompetenca', before: null, after: 'web dev' },
      { field: 'TAGS', key: null, before: ['vip', 'konferenca2025'], after: ['konferenca2025'] },
    ],
  }),
];

function renderDetails(
  changes: NonNullable<Parameters<typeof renderAuditApp>[1]>['handlers'] = {},
  action: 'UPDATE' | 'CREATE' | 'DELETE' = 'UPDATE',
) {
  return renderAuditApp(PATH, {
    role: 'VIEWER',
    handlers: {
      list: auditPageReply([auditEntry({ id: ENTRY, action })]),
      changes: changePageReply(EDIT_CHANGES),
      ...changes,
    },
  });
}

const detailsOf = (item: HTMLElement) => within(item).getByRole('group', { name: 'Podrobnosti' });

async function openDetails(user: ReturnType<typeof renderDetails>['user']) {
  const item = within(
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' }),
  ).getAllByRole('listitem')[0] as HTMLElement;
  await user.click(summaryOf(detailsOf(item)));
  return item;
}

/** Odpre skupino kontakta v podrobnostih. */
async function reveal(
  user: ReturnType<typeof renderDetails>['user'],
  item: HTMLElement,
  name: string,
  listName = 'Prizadeti kontakti',
) {
  const affected = await within(item).findByRole('list', { name: listName });
  await user.click(summaryOf(within(affected).getByRole('group', { name })));
}

describe('AuditDetails', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-005-08: podrobnosti so privzeto zaprte in ne naložijo sprememb; odprtje naloži prvo stran', async () => {
    const { user, api } = renderDetails();
    const item = within(
      await screen.findByRole('list', { name: 'Vnosi revizijske sledi' }),
    ).getAllByRole('listitem')[0] as HTMLElement;

    expect(detailsOf(item)).not.toHaveAttribute('open');
    expect(api.of('GET', CHANGES_API)).toHaveLength(0);
    await user.click(summaryOf(detailsOf(item)));

    expect(
      await within(item).findByRole('list', { name: 'Prizadeti kontakti' }),
    ).toBeInTheDocument();
    expect(api.of('GET', CHANGES_API)).toHaveLength(1);
    expect(api.of('GET', CHANGES_API)[0]?.search.toString()).toBe('page=0&size=25');
  });

  it('FR-005-08: kontakt je privzeto zaprt; razkritje pokaže preglednico samo s spremenjenimi polji', async () => {
    const { user } = renderDetails();
    const item = await openDetails(user);

    const affected = await within(item).findByRole('list', { name: 'Prizadeti kontakti' });
    expect(within(affected).getByRole('group', { name: 'Janez Novak' })).not.toHaveAttribute(
      'open',
    );
    expect(within(item).queryByRole('table')).not.toBeInTheDocument();
    await reveal(user, item, 'Janez Novak');

    const table = within(item).getByRole('table', { name: 'Spremembe kontakta Janez Novak' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Polje', 'Prej', 'Potem']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getByRole('rowheader').textContent);
    expect(rows).toEqual(['Telefon', 'kompetenca', 'Značke']);
    const phone = within(table).getByRole('row', { name: /Telefon/ });
    expect(
      within(phone)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['01 234 5678', '031 123 456']);
    const attribute = within(table).getByRole('row', { name: /kompetenca/ });
    expect(within(attribute).getAllByRole('cell')[0]).toHaveTextContent('—prazno');
    expect(within(attribute).getAllByRole('cell')[1]).toHaveTextContent('web dev');
    const tags = within(table).getByRole('row', { name: /Značke/ });
    expect(
      within(tags)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['vip, konferenca2025', 'konferenca2025']);
  });

  it('FR-005-08: dodan kontakt ima prazen stolpec Prej, odstranjen prazen stolpec Potem', async () => {
    const added = contactChange({
      displayName: 'Ana Prva',
      kind: 'ADDED',
      fields: [
        { field: 'FIRST_NAME', key: null, before: null, after: 'Ana' },
        { field: 'LAST_NAME', key: null, before: null, after: 'Prva' },
      ],
    });
    const removed = contactChange({
      contactId: contactId(2),
      displayName: 'Bojan Drugi',
      kind: 'REMOVED',
      fields: [
        { field: 'FIRST_NAME', key: null, before: 'Bojan', after: null },
        { field: 'EMAIL', key: null, before: 'bojan@primer.si', after: null },
      ],
    });
    const { user } = renderDetails({ changes: changePageReply([added, removed]) });
    const item = await openDetails(user);
    await reveal(user, item, 'Ana Prva');
    await reveal(user, item, 'Bojan Drugi');

    const addedTable = within(item).getByRole('table', { name: 'Spremembe kontakta Ana Prva' });
    for (const row of within(addedTable).getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('cell')[0]).toHaveTextContent('—prazno');
    }
    const removedTable = within(item).getByRole('table', {
      name: 'Spremembe kontakta Bojan Drugi',
    });
    for (const row of within(removedTable).getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('—prazno');
    }
    expect(within(removedTable).getByRole('rowheader', { name: 'E-naslov' })).toBeInTheDocument();
  });

  it('FR-005-08: več kot 25 kontaktov – paginacija sprememb »Strani rezultatov: Prizadeti kontakti«', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      contactChange({ contactId: contactId(i + 1), displayName: `Kontakt ${i + 1}` }),
    );
    const { user, api } = renderDetails({ changes: changePageReply(many) });
    const item = await openDetails(user);

    const nav = await within(item).findByRole('navigation', {
      name: 'Strani rezultatov: Prizadeti kontakti',
    });
    expect(within(nav).getByRole('status')).toHaveTextContent('1–25 od 30');
    const affected = within(item).getByRole('list', { name: 'Prizadeti kontakti' });
    expect(within(affected).getAllByRole('group')).toHaveLength(25);
    const size = within(nav).getByRole('combobox', { name: 'Velikost strani' });
    await user.selectOptions(size, '50');
    await waitFor(() =>
      expect(api.of('GET', CHANGES_API).at(-1)?.search.toString()).toBe('page=0&size=50'),
    );
    await waitFor(() => expect(within(affected).getAllByRole('group')).toHaveLength(30));
    await user.selectOptions(size, '25');
    await waitFor(() => expect(within(affected).getAllByRole('group')).toHaveLength(25));
    await user.click(within(nav).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() =>
      expect(within(item).getByRole('group', { name: 'Kontakt 26' })).toBeInTheDocument(),
    );
    expect(api.of('GET', CHANGES_API).at(-1)?.search.toString()).toBe('page=1&size=25');
    expect(within(nav).getByRole('status')).toHaveTextContent('26–30 od 30');
    // Paginacija sprememb ne spremeni poti sledi.
    expect(window.location.search).toBe('');
  });

  it('FR-005-08: vnos z do 25 kontakti nima paginacije sprememb', async () => {
    const { user } = renderDetails();
    const item = await openDetails(user);

    await within(item).findByRole('list', { name: 'Prizadeti kontakti' });
    expect(
      within(item).queryByRole('navigation', { name: 'Strani rezultatov: Prizadeti kontakti' }),
    ).not.toBeInTheDocument();
  });

  it('FR-005-18: napaka nalaganja podrobnosti je trajno sporočilo; Poskusi znova ponovi zahtevek', async () => {
    let fail = true;
    const { user, api } = renderDetails({
      changes: (_id, url) =>
        fail
          ? { status: 500, body: { code: 'INTERNAL' } }
          : changePageReply(EDIT_CHANGES)(_id, url),
    });
    const item = await openDetails(user);

    const alert = await within(item).findByRole('alert');
    expect(alert).toHaveTextContent('Podrobnosti ni bilo mogoče naložiti. Poskusi znova.');
    expect(alert).not.toHaveTextContent('INTERNAL');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(
      await within(item).findByRole('list', { name: 'Prizadeti kontakti' }),
    ).toBeInTheDocument();
    expect(api.of('GET', CHANGES_API)).toHaveLength(2);
  });

  it('FR-005-08: podrobnosti v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { user } = renderDetails();
    const item = within(
      await screen.findByRole('list', { name: 'Audit trail entries' }),
    ).getAllByRole('listitem')[0] as HTMLElement;
    await user.click(summaryOf(within(item).getByRole('group', { name: 'Details' })));
    await reveal(user, item, 'Janez Novak', 'Affected contacts');

    const table = within(item).getByRole('table', { name: 'Changes to contact Janez Novak' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Field', 'Before', 'After']);
    expect(within(table).getByRole('rowheader', { name: 'Phone' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Tags' })).toBeInTheDocument();
  });

  it('FR-005-08: odprte podrobnosti brez kršitev axe', async () => {
    const { user, container } = renderDetails();
    const item = await openDetails(user);
    await reveal(user, item, 'Janez Novak');

    expect((await axe(container)).violations).toEqual([]);
  });
});
