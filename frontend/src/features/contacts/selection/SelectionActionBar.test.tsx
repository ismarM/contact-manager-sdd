import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  contactId,
  contactIdsReply,
  contactSummaries,
  filterOptionsReply,
  GROUP_ID,
  renderContactsApp,
  resultsReply,
} from '../../../test/contactsApi';
import {
  actionBar,
  expectCount,
  JANEZ,
  LIST,
  listReady,
  pick,
  rowBox,
} from '../../../test/selection';

// Akcijska vrstica izbora (FR-009-03, FR-009-04, FR-009-05, FR-009-15; specs/009-mnozicno-urejanje/plan.md – Key
// elements). »Izvozi v Excel« je dodala 010 (FR-010-01, D-91): izriše se vsem vlogam, tudi v arhivirani skupini.

const IDS_PATH = `/api/groups/${GROUP_ID}/contact-ids`;
const RESULTS = [JANEZ, ...contactSummaries(24, 2)];
const matches = (count: number) => Array.from({ length: count }, (_, i) => contactId(1_000 + i));

type Options = Parameters<typeof renderContactsApp>[1];

function app(path = LIST, options: Options = {}, total = 312) {
  return renderContactsApp(path, {
    role: 'EDITOR',
    ...options,
    contacts: {
      list: resultsReply(RESULTS, total),
      filters: () => filterOptionsReply([], ['vip']),
      contactIds: () => contactIdsReply(matches(total)),
      ...options.contacts,
    },
  });
}

describe('SelectionActionBar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-009-05: urednik v nearhivirani skupini vidi vse akcije, tudi »Izvozi v Excel«', async () => {
    const { user } = app();
    await listReady();
    await pick(user, 'Janez Novak');

    const bar = await actionBar();

    expect(bar.getByRole('status')).toHaveTextContent('Izbran: 1');
    expect(bar.getByRole('button', { name: 'Izberi vse zadetke (312)' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Uredi izbrane' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Izbriši' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Počisti izbor' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Izvozi v Excel' })).toBeInTheDocument();
  });

  it('FR-009-05: bralec vidi samo »Izberi vse zadetke (N)«, »Izvozi v Excel«, »Počisti izbor« in število izbranih', async () => {
    const { user } = app(LIST, { role: 'VIEWER' });
    await listReady();
    await pick(user, 'Janez Novak');

    const bar = await actionBar();

    expect(bar.getByRole('status')).toHaveTextContent('Izbran: 1');
    expect(bar.getByRole('button', { name: 'Izberi vse zadetke (312)' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Počisti izbor' })).toBeInTheDocument();
    expect(bar.queryByRole('button', { name: 'Uredi izbrane' })).not.toBeInTheDocument();
    expect(bar.queryByRole('button', { name: 'Izbriši' })).not.toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Izvozi v Excel' })).toBeInTheDocument();
  });

  it.each(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER'] as const)(
    'FR-009-15: arhivirana skupina, vloga %s – izbor deluje, akcij pisanja ni',
    async (role) => {
      const { user } = app(LIST, { role, archived: true });
      await listReady();
      await pick(user, 'Janez Novak');

      const bar = await actionBar();

      expect(bar.getByRole('status')).toHaveTextContent('Izbran: 1');
      expect(bar.getByRole('button', { name: 'Izberi vse zadetke (312)' })).toBeInTheDocument();
      expect(bar.getByRole('button', { name: 'Počisti izbor' })).toBeInTheDocument();
      expect(bar.queryByRole('button', { name: 'Uredi izbrane' })).not.toBeInTheDocument();
      expect(bar.queryByRole('button', { name: 'Izbriši' })).not.toBeInTheDocument();
      expect(bar.getByRole('button', { name: 'Izvozi v Excel' })).toBeInTheDocument();
    },
  );

  it('FR-009-03: »Izberi vse zadetke« pošlje isti q, f in tag kot seznam in prišteje zadetke k izboru', async () => {
    const { user, api } = app(`${LIST}?q=novak&f=email:feri.si&tag=vip`);
    await listReady();
    await pick(user, 'Janez Novak');

    await user.click((await actionBar()).getByRole('button', { name: 'Izberi vse zadetke (312)' }));

    await expectCount('Izbranih: 313');
    const requests = api.of('GET', IDS_PATH);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.search.get('q')).toBe('novak');
    expect(requests[0]?.search.getAll('f')).toEqual(['email:feri.si']);
    expect(requests[0]?.search.getAll('tag')).toEqual(['vip']);
    expect(rowBox('Janez Novak')).toBeChecked();
  });

  it('FR-009-03: kontakti, ki so že izbrani, se pri »Izberi vse zadetke« ne štejejo dvakrat', async () => {
    const { user } = app(LIST, {
      contacts: { contactIds: () => contactIdsReply([JANEZ.id, ...matches(311)], 312) },
    });
    await listReady();
    await pick(user, 'Janez Novak');

    await user.click((await actionBar()).getByRole('button', { name: 'Izberi vse zadetke (312)' }));

    await expectCount('Izbranih: 312');
  });

  it('FR-009-04: skupina z več kot 10 000 zadetki – sporočilo o meji in nespremenjeno število izbranih', async () => {
    const { user } = app(LIST, {}, 12_000);
    await listReady();
    await pick(user, 'Janez Novak');

    await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.',
    );
    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbran: 1');
  });

  it('FR-009-04: unija z obstoječim izborom nad 10 000 – sporočilo o meji, izbor nespremenjen', async () => {
    const { user } = app(
      LIST,
      { contacts: { contactIds: () => contactIdsReply(matches(10_000), 10_000) } },
      10_000,
    );
    await listReady();
    await pick(user, 'Janez Novak');

    await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.',
    );
    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbran: 1');
    expect(rowBox('Janez Novak')).toBeChecked();
  });

  it('FR-009-03 FR-009-17: napaka pri nalaganju zadetkov – alert, izbor nespremenjen', async () => {
    const { user } = app(LIST, {
      contacts: { contactIds: () => ({ status: 500, body: { code: 'INTERNAL_ERROR' } }) },
    });
    await listReady();
    await pick(user, 'Janez Novak');

    await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Zadetkov ni bilo mogoče naložiti. Poskusi znova.',
    );
    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbran: 1');
    expect(rowBox('Janez Novak')).toBeChecked();
  });

  it('FR-009-05: število izbranih je območje aria-live="polite"', async () => {
    const { user } = app();
    await listReady();

    await pick(user, 'Janez Novak');

    expect((await actionBar()).getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('FR-009-05: v angleščini imajo gumbi angleška imena', async () => {
    await i18n.changeLanguage('en');
    const { user } = app();
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    await user.click(await screen.findByRole('checkbox', { name: 'Select Janez Novak' }));

    const bar = within(await screen.findByRole('toolbar', { name: 'Selection actions' }));

    expect(bar.getByRole('button', { name: 'Select all results (312)' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Edit selected' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it('FR-009-04: sporočilo o meji je v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { user } = app(LIST, {}, 12_000);
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    await user.click(await screen.findByRole('checkbox', { name: 'Select Janez Novak' }));

    await user.click(
      within(await screen.findByRole('toolbar', { name: 'Selection actions' })).getByRole(
        'button',
        { name: /^Select all results/ },
      ),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can select at most 10,000 contacts. Narrow the search with filters.',
    );
  });

  it('FR-009-05: brez kršitev axe – akcijska vrstica urednika in sporočilo o meji', async () => {
    const { user, container } = app(LIST, {}, 12_000);
    await listReady();
    await pick(user, 'Janez Novak');
    await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));
    await screen.findByRole('alert');

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-009-15: brez kršitev axe – akcijska vrstica arhivirane skupine', async () => {
    const { user, container } = app(LIST, { role: 'OWNER', archived: true });
    await listReady();
    await pick(user, 'Janez Novak');
    await actionBar();

    expect((await axe(container)).violations).toEqual([]);
  });
});
