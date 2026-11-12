import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  archivedReply,
  bulkDeleteReply,
  bulkPath,
  contactId,
  contactPageReply,
  contactSummaries,
  deferred,
  forbiddenReply,
  listQueries,
  renderContactsApp,
  selectionChangedReply,
} from '../../../test/contactsApi';
import type { Reply } from '../../../test/groupsApi';
import { actionBar, headerBox, LIST, listReady, noActionBar } from '../../../test/selection';

// Množični izbris (FR-009-13, FR-009-17; specs/009-mnozicno-urejanje/plan.md – Key elements; design.md 8.11).

const DELETE = bulkPath('bulk-delete');
const CHECK = bulkPath('selection-check');

type Options = Parameters<typeof renderContactsApp>[1];

/** Seznam z `count` kontakti, vsi izbrani z »Izberi vse na strani«; odpre se potrditev z »Izbriši«. */
async function openConfirm(count = 3, options: Options = {}) {
  const all = contactSummaries(count);
  const view = renderContactsApp(LIST, {
    role: 'EDITOR',
    ...options,
    contacts: { list: (url) => contactPageReply(all)(url), ...options.contacts },
  });
  await listReady();
  await view.user.click(headerBox());
  const trigger = (await actionBar()).getByRole('button', { name: 'Izbriši' });
  await view.user.click(trigger);
  const dialog = await screen.findByRole('alertdialog');
  return { ...view, dialog: within(dialog), trigger, all };
}

describe('BulkDeleteDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-009-13: »Izbriši« odpre potrditev »Izbrišem 3 kontakte?« z razlago posledice, fokus je na »Prekliči«', async () => {
    await openConfirm(3);

    const dialog = await screen.findByRole('alertdialog', { name: 'Izbrišem 3 kontakte?' });
    expect(dialog).toHaveTextContent(
      'Kontakti bodo odstranjeni iz skupine Projekt FERI. Izbris bo zabeležen v revizijski sledi.',
    );
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Izbriši 3 kontakte' })).toBeInTheDocument();
  });

  it.each([
    [1, 'Izbrišem 1 kontakt?', 'Izbriši 1 kontakt', 'Izbrisan 1 kontakt.'],
    [2, 'Izbrišem 2 kontakta?', 'Izbriši 2 kontakta', 'Izbrisana 2 kontakta.'],
    [3, 'Izbrišem 3 kontakte?', 'Izbriši 3 kontakte', 'Izbrisani 3 kontakti.'],
    [5, 'Izbrišem 5 kontaktov?', 'Izbriši 5 kontaktov', 'Izbrisanih 5 kontaktov.'],
  ])(
    'FR-009-13: %i izbranih – »%s«, gumb »%s«, obvestilo »%s«',
    async (count, title, confirm, toast) => {
      const { user, dialog, api } = await openConfirm(count, {
        contacts: { bulkDelete: () => bulkDeleteReply(count) },
      });

      expect(screen.getByRole('alertdialog', { name: title })).toBeInTheDocument();
      await user.click(dialog.getByRole('button', { name: confirm }));

      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(toast),
      );
      expect(api.recordedBodies(DELETE)).toHaveLength(1);
    },
  );

  it('FR-009-13: Prekliči zapre potrditev brez zahtevka, izbor ostane, fokus se vrne na »Izbriši«', async () => {
    const { user, dialog, api } = await openConfirm(3);

    await user.click(dialog.getByRole('button', { name: 'Prekliči' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    const bar = await actionBar();
    expect(bar.getByRole('status')).toHaveTextContent('Izbrani: 3');
    expect(bar.getByRole('button', { name: 'Izbriši' })).toHaveFocus();
  });

  it('FR-009-13: Esc zapre potrditev brez zahtevka, izbor ostane, fokus se vrne na »Izbriši«', async () => {
    const { user, api } = await openConfirm(3);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    const bar = await actionBar();
    expect(bar.getByRole('status')).toHaveTextContent('Izbrani: 3');
    expect(bar.getByRole('button', { name: 'Izbriši' })).toHaveFocus();
  });

  it('FR-009-13: potrditev pošlje preverjanje in nato izbris z identitetami; izbor se počisti, seznam se osveži', async () => {
    const { user, dialog, api, all } = await openConfirm(3, {
      contacts: { bulkDelete: () => bulkDeleteReply(3) },
    });
    const before = listQueries(api).length;

    await user.click(dialog.getByRole('button', { name: 'Izbriši 3 kontakte' }));

    await waitFor(() => expect(api.recordedBodies(DELETE)).toHaveLength(1));
    expect(api.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual([
      CHECK,
      DELETE,
    ]);
    const body = api.recordedBodies(DELETE)[0] as { contactIds: string[] };
    expect(new Set(body.contactIds)).toEqual(new Set(all.map((contact) => contact.id)));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(listQueries(api).length).toBeGreaterThan(before));
    await waitFor(() => noActionBar());
  });

  it('FR-009-17: med pošiljanjem drugi klik ne pošlje drugega zahtevka', async () => {
    const pending = deferred<Reply>();
    const { user, dialog, api } = await openConfirm(3, {
      contacts: { bulkDelete: () => pending.promise },
    });

    await user.click(dialog.getByRole('button', { name: 'Izbriši 3 kontakte' }));
    await waitFor(() => expect(api.recordedBodies(DELETE)).toHaveLength(1));
    const confirm = dialog.getByRole('button', { name: 'Izbriši 3 kontakte' });
    await waitFor(() => expect(confirm).toHaveAttribute('aria-disabled', 'true'));
    await user.click(confirm);

    expect(api.recordedBodies(DELETE)).toHaveLength(1);
    pending.resolve(bulkDeleteReply(3));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it.each([
    ['403', forbiddenReply(), 'Za to dejanje nimaš več pravic.'],
    ['409 GROUP_ARCHIVED', archivedReply(), 'Skupina je arhivirana. Spreminjanje ni mogoče.'],
    ['omrežna napaka', 'network-error' as const, 'Strežnik ni dosegljiv. Poskusi znova.'],
  ])(
    'FR-009-17: %s – alert v potrditvi brez tehničnih kod, izbor ostane',
    async (_name, reply, text) => {
      const { user, dialog } = await openConfirm(3, { contacts: { bulkDelete: () => reply } });

      await user.click(dialog.getByRole('button', { name: 'Izbriši 3 kontakte' }));

      const alert = await dialog.findByRole('alert');
      expect(alert).toHaveTextContent(text);
      expect(alert).not.toHaveTextContent(/FORBIDDEN|GROUP_ARCHIVED|SELECTION_CHANGED/);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      await user.click(dialog.getByRole('button', { name: 'Prekliči' }));
      expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbrani: 3');
    },
  );

  it('FR-009-10 FR-009-17: omrežna napaka – alert ima gumb »Poskusi znova«, potrditev ostane odprta', async () => {
    const { user, dialog } = await openConfirm(3, {
      contacts: { bulkDelete: () => 'network-error' },
    });

    await user.click(dialog.getByRole('button', { name: 'Izbriši 3 kontakte' }));

    const alert = await dialog.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Poskusi znova' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('FR-009-10: 409 SELECTION_CHANGED pri izbrisu – isto obvestilo kot pri urejanju, »Odstrani jih iz izbora« zmanjša izbor', async () => {
    let calls = 0;
    const { user, dialog, api } = await openConfirm(3, {
      contacts: {
        bulkDelete: () => {
          calls += 1;
          return calls === 1 ? selectionChangedReply([contactId(2)]) : bulkDeleteReply(2);
        },
      },
    });

    await user.click(dialog.getByRole('button', { name: 'Izbriši 3 kontakte' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('1 izbrani kontakt ne obstaja več.');
    await user.click(dialog.getByRole('button', { name: 'Odstrani jih iz izbora' }));
    await user.click(await dialog.findByRole('button', { name: 'Izbriši 2 kontakta' }));
    await waitFor(() => expect(api.recordedBodies(DELETE)).toHaveLength(2));
    const retry = api.recordedBodies(DELETE)[1] as { contactIds: string[] };
    expect(retry.contactIds).not.toContain(contactId(2));
  });

  it('FR-009-13: en vmesnik – angleška potrditev in obvestilo', async () => {
    await i18n.changeLanguage('en');
    const view = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: {
        list: (url) => contactPageReply(contactSummaries(3))(url),
        bulkDelete: () => bulkDeleteReply(3),
      },
    });
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    await view.user.click(await screen.findByRole('checkbox', { name: 'Select all on page' }));
    await view.user.click(
      within(await screen.findByRole('toolbar', { name: 'Selection actions' })).getByRole(
        'button',
        {
          name: 'Delete',
        },
      ),
    );

    const dialog = within(await screen.findByRole('alertdialog', { name: 'Delete 3 contacts?' }));
    await view.user.click(dialog.getByRole('button', { name: 'Delete 3 contacts' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent(
        '3 contacts deleted.',
      ),
    );
  });

  it('FR-009-13: brez kršitev axe (sl) – potrditev izbrisa', async () => {
    await openConfirm(3);

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('FR-009-17: brez kršitev axe (sl) – potrditev z napako', async () => {
    const { user, dialog } = await openConfirm(3, {
      contacts: { bulkDelete: () => forbiddenReply() },
    });
    await user.click(dialog.getByRole('button', { name: 'Izbriši 3 kontakte' }));
    await dialog.findByRole('alert');

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
