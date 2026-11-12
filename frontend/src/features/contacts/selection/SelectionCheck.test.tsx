import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  bulkDeleteReply,
  bulkPath,
  bulkUpdateReply,
  contactId,
  contactIdsReply,
  contactSummaries,
  forbiddenReply,
  filterOptionsReply,
  listQueries,
  renderContactsApp,
  resultsReply,
  selectionChangedReply,
  selectionCheckReply,
} from '../../../test/contactsApi';
import type { SelectionCheckRequest } from '../types';
import {
  actionBar,
  displayName,
  expectCount,
  LIST,
  listReady,
  pick,
} from '../../../test/selection';

// Preverjanje sprememb izbora pred končno akcijo (FR-009-10, FR-009-18; specs/009-mnozicno-urejanje/plan.md, spec.md
// US3-3, US3-6 … US3-8, Edge Cases). Strežnik (MSW) vrne izid preverjanja; test preveri telo zahtevka in odziv vmesnika.

const UPDATE = bulkPath('bulk-update');
const DELETE = bulkPath('bulk-delete');
const CHECK = bulkPath('selection-check');
const PAGE = contactSummaries(12);
const ids = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => contactId(from + i));

type Options = Parameters<typeof renderContactsApp>[1];

/** Zadetki poizvedbe glede na parametre: dva filtra po znački → ids 8–20, iskanje `qN` → pet identitet, sicer 1–12. */
function matchesFor(url: URL): string[] {
  const q = url.searchParams.get('q') ?? '';
  const n = /^q(\d+)$/.exec(q)?.[1];
  if (n) return ids(Number(n) * 100, Number(n) * 100 + 4);
  return url.searchParams.getAll('tag').length === 2 ? ids(8, 20) : ids(1, 12);
}

function render(options: Options = {}, path = `${LIST}?tag=konferenca2025`) {
  return renderContactsApp(path, {
    role: 'EDITOR',
    ...options,
    contacts: {
      list: resultsReply(PAGE),
      filters: () => filterOptionsReply([], ['vip', 'konferenca2025']),
      contactIds: (url) => contactIdsReply(matchesFor(url)),
      ...options.contacts,
    },
  });
}

/** »Izberi vse zadetke (12)« po izboru enega kontakta; po želji se kontakt odznači (izbor ostane 11). */
async function selectAllMatches(user: UserEvent, deselect?: number) {
  await pick(user, displayName(1));
  await user.click((await actionBar()).getByRole('button', { name: 'Izberi vse zadetke (12)' }));
  await expectCount('Izbranih: 12');
  if (deselect !== undefined) {
    await user.click(screen.getByRole('checkbox', { name: `Izberi ${displayName(deselect)}` }));
    await expectCount('Izbranih: 11');
  }
}

async function openEdit(user: UserEvent, count: number | RegExp) {
  await user.click((await actionBar()).getByRole('button', { name: 'Uredi izbrane' }));
  const dialog = within(await screen.findByRole('dialog'));
  await user.type(dialog.getByRole('combobox', { name: 'Dodaj značke' }), 'nova{Enter}');
  return {
    dialog,
    apply: () =>
      user.click(
        dialog.getByRole('button', {
          name: typeof count === 'number' ? `Uporabi za ${count} kontaktov` : count,
        }),
      ),
  };
}

const checkBodies = (api: ReturnType<typeof render>['api']) =>
  api.recordedBodies(CHECK) as SelectionCheckRequest[];

describe('SelectionCheck', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-009-18: telo preverjanja vsebuje poizvedbo z značko, njene kontakte in ročno odznačene', async () => {
    const { user, api } = render();
    await listReady();
    await selectAllMatches(user, 4);
    const { apply } = await openEdit(user, 11);

    await apply();

    await waitFor(() => expect(checkBodies(api)).toHaveLength(1));
    const body = checkBodies(api)[0];
    expect(body?.contactIds).toHaveLength(11);
    expect(body?.queries).toHaveLength(1);
    const query = body?.queries[0];
    expect(query?.tag).toEqual(['konferenca2025']);
    expect(query?.q ?? '').toBe('');
    expect(query?.f ?? []).toEqual([]);
    expect(new Set(query?.contactIds)).toEqual(
      new Set(ids(1, 12).filter((id) => id !== contactId(4))),
    );
    expect(query?.excludedIds).toEqual([contactId(4)]);
  });

  it('FR-009-18: ročni izbor brez »Izberi vse zadetke« pošlje preverjanje brez poizvedb', async () => {
    const { user, api } = render();
    await listReady();
    await pick(user, displayName(1), displayName(2));
    const { apply } = await openEdit(user, 2);

    await apply();

    await waitFor(() => expect(checkBodies(api)).toHaveLength(1));
    expect(checkBodies(api)[0]?.queries).toEqual([]);
    expect(checkBodies(api)[0]?.contactIds).toHaveLength(2);
  });

  it('FR-009-18: pri dveh poizvedbah s skupnimi kontakti je kontakt samo v novejši poizvedbi', async () => {
    const { user, api } = render();
    await listReady();
    await selectAllMatches(user);
    const search = within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
    await user.click(search.getByRole('button', { name: /^Filtri/ }));
    const panel = within(await screen.findByRole('group', { name: 'Filtri kontaktov' }));
    await user.click(
      within(panel.getByRole('group', { name: 'Značke' })).getByRole('checkbox', { name: 'vip' }),
    );
    await user.click(panel.getByRole('button', { name: 'Uporabi filtre' }));
    await waitFor(() => expect(listQueries(api).at(-1)?.tag).toEqual(['konferenca2025', 'vip']));
    await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));
    await expectCount('Izbranih: 20');
    const { apply } = await openEdit(user, 20);

    await apply();

    await waitFor(() => expect(checkBodies(api)).toHaveLength(1));
    const queries = checkBodies(api)[0]?.queries ?? [];
    expect(queries).toHaveLength(2);
    const [older, newer] = queries;
    expect(newer?.tag).toEqual(['konferenca2025', 'vip']);
    expect(older?.tag).toEqual(['konferenca2025']);
    for (const id of newer?.contactIds ?? []) expect(older?.contactIds).not.toContain(id);
    expect(new Set(older?.contactIds)).toEqual(new Set(ids(1, 7)));
    expect(new Set(newer?.contactIds)).toEqual(new Set(ids(8, 20)));
  });

  it('FR-009-18: po 21 različnih »Izberi vse zadetke« telo vsebuje 20 poizvedb', async () => {
    const { user, api } = render({}, LIST);
    await listReady();
    await pick(user, displayName(1));
    const search = within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
    const box = search.getByRole('searchbox', { name: 'Iskanje po kontaktih' });

    for (let n = 1; n <= 21; n += 1) {
      await user.clear(box);
      await user.type(box, `q${n}`);
      await waitFor(() => expect(listQueries(api).at(-1)?.q).toBe(`q${n}`));
      await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));
      await expectCount(new RegExp(`: ${n * 5 + 1}$`));
    }
    const { apply } = await openEdit(user, 106);
    await apply();

    await waitFor(() => expect(checkBodies(api)).toHaveLength(1));
    const queries = checkBodies(api)[0]?.queries ?? [];
    expect(queries).toHaveLength(20);
    expect(queries.some((query) => query.q === 'q1')).toBe(false);
    expect(queries.some((query) => query.q === 'q21')).toBe(true);
  }, 90_000);

  it('FR-009-18: sprememba izbora – akcija se ne izvede, obvestilo s števili po vrstah in gumbi', async () => {
    const { user, api } = render({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({
            missing: [contactId(2)],
            queries: [
              { newMatches: [contactId(30), contactId(31)], noLongerMatching: [contactId(3)] },
            ],
          }),
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);

    await apply();

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Izbor se je spremenil: 2 nova zadetka, 1 kontakt ne ustreza več filtrom, 1 kontakt ne obstaja več.',
    );
    expect(api.recordedBodies(UPDATE)).toHaveLength(0);
    expect(
      dialog.getByRole('checkbox', { name: 'Odstrani tudi kontakte, ki ne ustrezajo več filtrom' }),
    ).toBeChecked();
    expect(dialog.getByRole('button', { name: 'Posodobi izbor' })).toBeInTheDocument();
    expect(
      dialog.getByRole('button', { name: 'Nadaljuj z obstoječim izborom' }),
    ).toBeInTheDocument();
  });

  it('FR-009-18: »Posodobi izbor« s kljukico: 12 − 1 − 1 + 2; dialog ostane odprt z vnosi, gumb »Uporabi za 12 kontaktov«', async () => {
    const { user, api } = render({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({
            missing: [contactId(2)],
            queries: [
              { newMatches: [contactId(30), contactId(31)], noLongerMatching: [contactId(3)] },
            ],
          }),
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);
    await apply();
    await dialog.findByRole('alert');

    await user.click(dialog.getByRole('button', { name: 'Posodobi izbor' }));

    await expectCount('Izbranih: 12');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Odstrani značko nova' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' })).toBeInTheDocument();
    expect(api.recordedBodies(UPDATE)).toHaveLength(0);
  });

  it('FR-009-18: »Posodobi izbor« brez kljukice obdrži neustrezne kontakte → 13', async () => {
    const { user } = render({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({
            missing: [contactId(2)],
            queries: [
              { newMatches: [contactId(30), contactId(31)], noLongerMatching: [contactId(3)] },
            ],
          }),
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);
    await apply();
    await dialog.findByRole('alert');
    await user.click(
      dialog.getByRole('checkbox', { name: 'Odstrani tudi kontakte, ki ne ustrezajo več filtrom' }),
    );

    await user.click(dialog.getByRole('button', { name: 'Posodobi izbor' }));

    await expectCount('Izbranih: 13');
    expect(dialog.getByRole('button', { name: 'Uporabi za 13 kontaktov' })).toBeInTheDocument();
  });

  it('FR-009-18: »Posodobi izbor« in nato »Uporabi« pošlje posodobljen izbor (brez neobstoječih in neustreznih, z novimi)', async () => {
    let checks = 0;
    const { user, api } = render({
      contacts: {
        selectionCheck: () => {
          checks += 1;
          return checks === 1
            ? selectionCheckReply({
                missing: [contactId(2)],
                queries: [
                  { newMatches: [contactId(30), contactId(31)], noLongerMatching: [contactId(3)] },
                ],
              })
            : selectionCheckReply({ queries: [{}] });
        },
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);
    await apply();
    await dialog.findByRole('alert');
    await user.click(dialog.getByRole('button', { name: 'Posodobi izbor' }));
    await expectCount('Izbranih: 12');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(1));
    const body = api.recordedBodies(UPDATE)[0] as { contactIds: string[] };
    const expected = ids(1, 12)
      .filter((id) => id !== contactId(2) && id !== contactId(3))
      .concat([contactId(30), contactId(31)]);
    expect(new Set(body.contactIds)).toEqual(new Set(expected));
  });

  it('FR-009-18: »Nadaljuj z obstoječim izborom« izvede akcijo za 11 obstoječih kontaktov', async () => {
    const { user, api } = render({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({
            missing: [contactId(2)],
            queries: [
              { newMatches: [contactId(30), contactId(31)], noLongerMatching: [contactId(3)] },
            ],
          }),
        bulkUpdate: () => bulkUpdateReply(11),
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);
    await apply();
    await dialog.findByRole('alert');

    await user.click(dialog.getByRole('button', { name: 'Nadaljuj z obstoječim izborom' }));

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(1));
    const body = api.recordedBodies(UPDATE)[0] as { contactIds: string[] };
    expect(body.contactIds).toHaveLength(11);
    expect(body.contactIds).not.toContain(contactId(2));
    expect(body.contactIds).toContain(contactId(3));
    expect(body.contactIds).not.toContain(contactId(30));
  });

  it('FR-009-18: brez sprememb (npr. spremenjen telefon) se akcija izvede takoj, brez obvestila', async () => {
    const { user, api } = render({
      contacts: { selectionCheck: () => selectionCheckReply({ changed: false, queries: [{}] }) },
    });
    await listReady();
    await selectAllMatches(user);
    const { apply } = await openEdit(user, 12);

    await apply();

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Posodobi izbor' })).not.toBeInTheDocument();
  });

  it('FR-009-18: pri brez neustreznih kontaktov kljukice »Odstrani tudi …« ni', async () => {
    const { user } = render({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({ queries: [{ newMatches: [contactId(30)], noLongerMatching: [] }] }),
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);

    await apply();

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Izbor se je spremenil: 1 nov zadetek.',
    );
    expect(
      dialog.queryByRole('checkbox', {
        name: 'Odstrani tudi kontakte, ki ne ustrezajo več filtrom',
      }),
    ).not.toBeInTheDocument();
  });

  it('FR-009-18: posodobitev, ki bi presegla 10 000, pokaže sporočilo o meji; izbor ostane, »Nadaljuj« je na voljo', async () => {
    const many = Array.from({ length: 9_999 }, (_, i) => contactId(100_000 + i));
    const { user } = render({
      contacts: {
        contactIds: () => contactIdsReply(many, 9_999),
        selectionCheck: () =>
          selectionCheckReply({
            queries: [{ newMatches: ids(1, 5), noLongerMatching: [] }],
          }),
      },
    });
    await listReady();
    await pick(user, displayName(1));
    await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));
    await expectCount(/: 10[\s.]?000$/);
    await user.click(screen.getByRole('checkbox', { name: `Izberi ${displayName(1)}` }));
    await expectCount(/: 9[\s.]?999$/);
    const { dialog, apply } = await openEdit(user, /^Uporabi za .* kontaktov$/);
    await apply();
    await dialog.findByRole('button', { name: 'Posodobi izbor' });

    await user.click(dialog.getByRole('button', { name: 'Posodobi izbor' }));

    await waitFor(() =>
      expect(
        dialog
          .getAllByRole('alert')
          .map((alert) => alert.textContent)
          .join(' '),
      ).toContain('Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.'),
    );
    expect(
      dialog.getByRole('button', { name: 'Nadaljuj z obstoječim izborom' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /^Uredi izbrane kontakte/ })).toBeInTheDocument();
  }, 60_000);

  it('FR-009-10: 409 SELECTION_CHANGED – alert »2 izbrana kontakta ne obstajata več.«; »Odstrani jih iz izbora« in ponovitev', async () => {
    let calls = 0;
    const { user, api } = render({
      contacts: {
        bulkUpdate: () => {
          calls += 1;
          return calls === 1
            ? selectionChangedReply([contactId(2), contactId(3)])
            : bulkUpdateReply(10);
        },
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);
    await apply();

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      '2 izbrana kontakta ne obstajata več.',
    );
    await user.click(dialog.getByRole('button', { name: 'Odstrani jih iz izbora' }));
    await expectCount('Izbranih: 10');
    expect(api.recordedBodies(UPDATE)).toHaveLength(1);

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 10 kontaktov' }));

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(2));
    const retry = api.recordedBodies(UPDATE)[1] as { contactIds: string[] };
    expect(retry.contactIds).toHaveLength(10);
    expect(retry.contactIds).not.toContain(contactId(2));
    expect(retry.contactIds).not.toContain(contactId(3));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Posodobljenih 10 kontaktov.',
      ),
    );
  });

  it('FR-009-18 FR-009-13: pri izbrisu sprememba izbora prepreči izbris; »Nadaljuj« izbriše preostale', async () => {
    const { user, api } = render({
      contacts: {
        selectionCheck: () => selectionCheckReply({ missing: [contactId(2)], queries: [{}] }),
        bulkDelete: () => bulkDeleteReply(11),
      },
    });
    await listReady();
    await selectAllMatches(user);
    await user.click((await actionBar()).getByRole('button', { name: 'Izbriši' }));
    const dialog = within(await screen.findByRole('alertdialog'));

    await user.click(dialog.getByRole('button', { name: 'Izbriši 12 kontaktov' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Izbor se je spremenil: 1 kontakt ne obstaja več.',
    );
    expect(api.recordedBodies(DELETE)).toHaveLength(0);

    await user.click(dialog.getByRole('button', { name: 'Nadaljuj z obstoječim izborom' }));

    await waitFor(() => expect(api.recordedBodies(DELETE)).toHaveLength(1));
    const body = api.recordedBodies(DELETE)[0] as { contactIds: string[] };
    expect(body.contactIds).toHaveLength(11);
    expect(body.contactIds).not.toContain(contactId(2));
  });

  it.each([
    ['omrežna napaka', 'network-error' as const, 'Strežnik ni dosegljiv. Poskusi znova.'],
    ['403', forbiddenReply(), 'Za to dejanje nimaš več pravic.'],
    ['5xx', { status: 500, body: { code: 'INTERNAL_ERROR' } }, undefined],
  ])(
    'FR-009-17 FR-009-18: preverjanje samo ne uspe (%s) – alert v dialogu, dialog odprt, akcija ni poslana',
    async (_name, reply, text) => {
      const { user, api } = render({ contacts: { selectionCheck: () => reply } });
      await listReady();
      await selectAllMatches(user);
      const { dialog, apply } = await openEdit(user, 12);

      await apply();

      const alert = await dialog.findByRole('alert');
      if (text) expect(alert).toHaveTextContent(text);
      expect(alert).not.toHaveTextContent(/FORBIDDEN|INTERNAL_ERROR|SELECTION_CHANGED|VALIDATION/);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(api.recordedBodies(UPDATE)).toHaveLength(0);
    },
  );

  it('FR-009-18: brez kršitev axe – obvestilo o spremenjenem izboru', async () => {
    const { user } = render({
      contacts: {
        selectionCheck: () =>
          selectionCheckReply({
            missing: [contactId(2)],
            queries: [{ newMatches: [contactId(30)], noLongerMatching: [contactId(3)] }],
          }),
      },
    });
    await listReady();
    await selectAllMatches(user);
    const { dialog, apply } = await openEdit(user, 12);
    await apply();
    await dialog.findByRole('alert');

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
