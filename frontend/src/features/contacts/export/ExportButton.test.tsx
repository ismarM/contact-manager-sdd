import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { localDateStamp } from '../../../shared/download';
import { i18n } from '../../../i18n';
import {
  contactId,
  contactIdsReply,
  contactSummaries,
  deferred,
  exportEmptyReply,
  exportError,
  exportReply,
  exportValidationReply,
  filterOptionsReply,
  renderContactsApp,
  resultsReply,
  selectionCheckReply,
} from '../../../test/contactsApi';
import { captureDownloads } from '../../../test/myDataApi';
import {
  actionBar,
  displayName,
  expectCount,
  LIST,
  listReady,
  pick,
} from '../../../test/selection';

// Izvoz izbranih kontaktov (FR-010-01, 02, 04, 07, 10, 11, 13, 14, 15, 16, SC-005; specs/010-izvoz-excel/plan.md – Key
// elements and accessible names). Strežnik (MSW) vrne datoteko ali napako; test preveri zahtevke in odziv vmesnika.

const EXPORT_PATH = /\/contacts\/export$/;
const PAGE = contactSummaries(12);
const SORTED = `${LIST}?sort=email&dir=desc`;

type Options = Parameters<typeof renderContactsApp>[1];

function render(path = SORTED, options: Options = {}) {
  return renderContactsApp(path, {
    role: 'EDITOR',
    ...options,
    contacts: {
      list: resultsReply(PAGE),
      filters: () => filterOptionsReply([], ['vip']),
      ...options.contacts,
    },
  });
}

/** Izbere tri kontakte. */
async function selectThree(user: UserEvent) {
  await listReady();
  await pick(user, displayName(1), displayName(2), displayName(3));
  await expectCount('Izbrani: 3');
}

const exportButton = async () =>
  (await actionBar()).getByRole('button', { name: 'Izvozi v Excel' });

async function runExport(user: UserEvent) {
  await user.click(await exportButton());
}

const toasts = () => screen.getByRole('region', { name: 'Obvestila' });

const OPTIONS = { timeout: 1000 };

const MATCHES = Array.from({ length: 12 }, (_, i) => contactId(i + 1));
const FILTERED = `${SORTED}&tag=konferenca2025`;

/** Skupina z 12 zadetki filtra; »Izberi vse zadetke (12)« po izboru enega kontakta (posnetek zadetkov, FR-009-18). */
function renderMatches(options: Options = {}) {
  return render(FILTERED, {
    ...options,
    contacts: { contactIds: () => contactIdsReply(MATCHES), ...options.contacts },
  });
}

async function selectAllMatches(user: UserEvent) {
  await listReady();
  await pick(user, displayName(1));
  await user.click((await actionBar()).getByRole('button', { name: 'Izberi vse zadetke (12)' }));
  await expectCount('Izbranih: 12');
}

describe('ExportButton', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-010-01: brez izbora ni gumba »Izvozi v Excel«', async () => {
    render();
    await listReady();

    expect(screen.queryByRole('button', { name: 'Izvozi v Excel' })).not.toBeInTheDocument();
  });

  it.each(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER'] as const)(
    'FR-010-01: vloga %s po izboru kontakta vidi »Izvozi v Excel« v »Dejanja izbora«',
    async (role) => {
      const { user } = render(SORTED, { role });
      await listReady();
      await pick(user, displayName(1));

      expect(await exportButton()).toBeInTheDocument();
    },
  );

  it.each(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER'] as const)(
    'FR-010-16: arhivirana skupina, vloga %s – v vrstici so natanko Izbrani, Izberi vse zadetke, Izvozi v Excel in Počisti izbor',
    async (role) => {
      const { user } = render(SORTED, { role, archived: true });
      await listReady();
      await pick(user, displayName(1), displayName(2), displayName(3));

      const bar = await actionBar();

      expect(bar.getByRole('status')).toHaveTextContent('Izbrani: 3');
      expect(bar.getAllByRole('button').map((b) => b.textContent)).toEqual([
        expect.stringMatching(/^Izberi vse zadetke \(\d+\)$/),
        'Izvozi v Excel',
        'Počisti izbor',
      ]);
      expect(bar.queryByRole('button', { name: 'Uredi izbrane' })).not.toBeInTheDocument();
      expect(bar.queryByRole('button', { name: 'Izbriši' })).not.toBeInTheDocument();
    },
  );

  it('FR-010-02 FR-010-07 FR-010-04: klik najprej pošlje selection-check, nato export z identitetami, sort, dir in language', async () => {
    captureDownloads();
    const { user, api } = render();
    await selectThree(user);

    await runExport(user);

    await waitFor(() => expect(api.exportRequests()).toHaveLength(1));
    const paths = api.requests.filter((r) => r.method === 'POST').map((r) => r.path);
    const check = paths.findIndex((p) => p.endsWith('/selection-check'));
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(paths.findIndex((p) => EXPORT_PATH.test(p)));
    const request = api.exportRequests()[0];
    expect(new Set(request?.contactIds)).toEqual(
      new Set([contactId(1), contactId(2), contactId(3)]),
    );
    expect(request).toMatchObject({ sort: 'email', dir: 'desc', language: 'sl' });
  });

  it('FR-010-15: med pripravo ima gumb ime »Pripravljam izvoz…« z aria-disabled, en status, drugi klik ne pošlje drugega zahtevka', async () => {
    captureDownloads();
    const gate = deferred<void>();
    const { user, api } = render(SORTED, {
      contacts: {
        export: async () => {
          await gate.promise;
          return exportReply({ count: 3 });
        },
      },
    });
    await selectThree(user);

    await runExport(user);

    const busy = await screen.findByRole('button', { name: 'Pripravljam izvoz…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getAllByRole('status').filter((s) => s.textContent === 'Pripravljam izvoz…'),
    ).toHaveLength(1);
    await user.click(busy);
    expect(api.exportRequests()).toHaveLength(1);
    expect((await axe(document.body)).violations).toEqual([]);

    gate.resolve();
    await screen.findByRole('button', { name: 'Izvozi v Excel' });
  });

  it('FR-010-10 FR-010-14 FR-010-15 SC-005: uspeh – prenos Projekt-FERI-kontakti-‹datum›.xlsx, toast »Izvoženih kontaktov: 3.«, izbor ostane', async () => {
    const downloads = captureDownloads();
    const { user } = render(SORTED, { contacts: { export: () => exportReply({ count: 3 }) } });
    await selectThree(user);

    await runExport(user);

    await waitFor(() => expect(toasts()).toHaveTextContent('Izvoženih kontaktov: 3.'), OPTIONS);
    expect(downloads.names).toEqual([`Projekt-FERI-kontakti-${localDateStamp(new Date())}.xlsx`]);
    await expectCount('Izbrani: 3');
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it.each([
    [1, 2, 'Izvoženih kontaktov: 2. 1 izbrani kontakt je bil medtem izbrisan in ni v datoteki.'],
    [
      2,
      1,
      'Izvoženih kontaktov: 1. 2 izbrana kontakta sta bila medtem izbrisana in ju ni v datoteki.',
    ],
    [
      3,
      1,
      'Izvoženih kontaktov: 1. 3 izbrani kontakti so bili medtem izbrisani in jih ni v datoteki.',
    ],
    [
      5,
      1,
      'Izvoženih kontaktov: 1. 5 izbranih kontaktov je bilo medtem izbrisanih in jih ni v datoteki.',
    ],
  ])('FR-010-11: X-Export-Skipped %i → toast z množino', async (skipped, count, text) => {
    captureDownloads();
    const { user } = render(SORTED, {
      contacts: { export: () => exportReply({ count, skipped }) },
    });
    await selectThree(user);

    await runExport(user);

    await waitFor(() => expect(toasts()).toHaveTextContent(text), OPTIONS);
  });

  it('FR-010-02: spremenjen izbor (nov zadetek) – obvestilo, izvoz ni poslan; »Posodobi izbor« izvoza ne sproži', async () => {
    const { user, api } = renderMatches({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({ queries: [{ newMatches: [contactId(30)], noLongerMatching: [] }] }),
      },
    });
    await selectAllMatches(user);

    await runExport(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Izbor se je spremenil: 1 nov zadetek.',
    );
    expect(api.exportRequests()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Posodobi izbor' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Posodobi izbor' })).not.toBeInTheDocument(),
    );
    expect(api.exportRequests()).toHaveLength(0);
    await expectCount('Izbranih: 13');
  });

  it('FR-010-02: nov zadetek + »Nadaljuj z obstoječim izborom« izvozi prvotnih 12 kontaktov, toast in prenos', async () => {
    const downloads = captureDownloads();
    const { user, api } = renderMatches({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({ queries: [{ newMatches: [contactId(30)], noLongerMatching: [] }] }),
        export: () => exportReply({ count: 12 }),
      },
    });
    await selectAllMatches(user);

    await runExport(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Izbor se je spremenil: 1 nov zadetek.',
    );
    await user.click(screen.getByRole('button', { name: 'Nadaljuj z obstoječim izborom' }));

    await waitFor(() => expect(api.exportRequests()).toHaveLength(1));
    const exported = api.exportRequests()[0]?.contactIds ?? [];
    expect(exported).toHaveLength(12);
    expect(new Set(exported)).toEqual(new Set(MATCHES));
    await waitFor(() => expect(toasts()).toHaveTextContent('Izvoženih kontaktov: 12.'), OPTIONS);
    expect(downloads.names).toEqual([`Projekt-FERI-kontakti-${localDateStamp(new Date())}.xlsx`]);
  });

  it('FR-010-02 FR-010-11: manjkajoč kontakt – obvestilo, »Nadaljuj z obstoječim izborom« izvozi preostale, toast »Izvoženih kontaktov: 2.« in prenos', async () => {
    const downloads = captureDownloads();
    const { user, api } = render(SORTED, {
      contacts: {
        selectionCheck: () => selectionCheckReply({ missing: [contactId(3)] }),
        export: () => exportReply({ count: 2 }),
      },
    });
    await selectThree(user);

    await runExport(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Izbor se je spremenil: 1 kontakt ne obstaja več.',
    );
    expect(api.exportRequests()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Nadaljuj z obstoječim izborom' }));

    await waitFor(() => expect(api.exportRequests()).toHaveLength(1));
    expect(new Set(api.exportRequests()[0]?.contactIds)).toEqual(
      new Set([contactId(1), contactId(2)]),
    );
    await waitFor(() => expect(toasts()).toHaveTextContent('Izvoženih kontaktov: 2.'), OPTIONS);
    expect(downloads.names).toEqual([`Projekt-FERI-kontakti-${localDateStamp(new Date())}.xlsx`]);
  });

  it.each([
    [
      'FR-010-11: 409 EXPORT_EMPTY',
      exportEmptyReply,
      'Nobeden od izbranih kontaktov ne obstaja več.',
    ],
    [
      'FR-010-13: 400 TOO_MANY',
      () => exportValidationReply({ field: 'contactIds', code: 'TOO_MANY' }),
      'Naenkrat lahko izvoziš največ 10 000 kontaktov. Zoži iskanje s filtri.',
    ],
    [
      'FR-010-13: 400 TOO_MANY_COLUMNS',
      () => exportValidationReply({ field: 'contactIds', code: 'TOO_MANY_COLUMNS' }),
      'Izbrani kontakti imajo preveč različnih dodatnih atributov za en list. Izvozi manjši izbor.',
    ],
    ['FR-010-15: 500', () => exportError(500), 'Izvoz ni uspel. Poskusi znova.'],
    ['FR-010-15: 404', () => exportError(404), 'Izvoz ni uspel. Poskusi znova.'],
    [
      'FR-010-15: druga 400',
      () => exportValidationReply({ field: 'sort', code: 'INVALID_VALUE' }),
      'Izvoz ni uspel. Poskusi znova.',
    ],
    [
      'FR-010-15: brez povezave',
      () => 'network-error' as const,
      'Ni povezave. Preveri povezavo in poskusi znova.',
    ],
  ])(
    '%s → alert z besedilom, brez prenosa, izbor ostane, »Poskusi znova« ponovi preverjanje in izvoz',
    async (_name, reply, text) => {
      const downloads = captureDownloads();
      const { user, api } = render(SORTED, { contacts: { export: () => reply() } });
      await selectThree(user);

      await runExport(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(downloads.names).toEqual([]);
      await expectCount('Izbrani: 3');
      expect((await axe(document.body)).violations).toEqual([]);
      await user.click(
        within(screen.getByRole('alert')).getByRole('button', { name: 'Poskusi znova' }),
      );
      await waitFor(() => expect(api.exportRequests()).toHaveLength(2));
      expect(api.requests.filter((r) => r.path.endsWith('/selection-check'))).toHaveLength(2);
    },
  );

  it('FR-010-04 FR-010-10: angleški vmesnik – language en, ime …-contacts-….xlsx, »Contacts exported: 3.«', async () => {
    await i18n.changeLanguage('en');
    const downloads = captureDownloads();
    const { user, api } = render(SORTED, { contacts: { export: () => exportReply({ count: 3 }) } });
    await listReady();
    for (const name of [displayName(1), displayName(2), displayName(3)]) {
      await user.click(await screen.findByRole('checkbox', { name: `Select ${name}` }));
    }

    await user.click(
      within(await screen.findByRole('toolbar', { name: 'Selection actions' })).getByRole(
        'button',
        { name: 'Export to Excel' },
      ),
    );

    await waitFor(() => expect(toasts()).toHaveTextContent('Contacts exported: 3.'), OPTIONS);
    expect(api.exportRequests()[0]?.language).toBe('en');
    expect(downloads.names).toEqual([`Projekt-FERI-contacts-${localDateStamp(new Date())}.xlsx`]);
  });

  it('FR-010-15: v mirovanju je akcijska vrstica z gumbom brez kršitev axe', async () => {
    const { user } = render();
    await selectThree(user);

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
