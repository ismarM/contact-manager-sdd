import { type BoundFunctions, type queries, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { JsonBodyType } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  archivedReply,
  bulkPath,
  bulkUpdateReply,
  bulkValidationReply,
  contactPageReply,
  contactSummaries,
  contactSummary,
  deferred,
  forbiddenReply,
  listQueries,
  renderContactsApp,
} from '../../../test/contactsApi';
import { groupDetail, type Reply } from '../../../test/groupsApi';
import {
  actionBar,
  displayName,
  expectCount,
  headerBox,
  LIST,
  listReady,
} from '../../../test/selection';

// Dialog »Uredi izbrane« (FR-009-06, FR-009-07, FR-009-08, FR-009-09, FR-009-12, FR-009-17; specs/009-mnozicno-urejanje/
// plan.md – Key elements). Seznam, preverjanje in operacijo podaja test (MSW).

const UPDATE = bulkPath('bulk-update');
const CHECK = bulkPath('selection-check');

type Scope = BoundFunctions<typeof queries>;
type Options = Parameters<typeof renderContactsApp>[1];

/** Seznam z `count` kontakti; vsi so na prvi strani in izbrani z »Izberi vse na strani«. */
async function openDialog(count = 12, options: Options = {}) {
  const all = contactSummaries(count);
  const view = renderContactsApp(LIST, {
    role: 'EDITOR',
    ...options,
    contacts: { list: (url) => contactPageReply(all)(url), ...options.contacts },
  });
  await listReady();
  await view.user.click(headerBox());
  const bar = await actionBar();
  await view.user.click(bar.getByRole('button', { name: 'Uredi izbrane' }));
  const dialog = within(
    await screen.findByRole('dialog', {
      name: `Uredi izbrane kontakte (${count})`,
    }),
  );
  return { ...view, dialog, all };
}

async function addTag(user: UserEvent, dialog: Scope, label: string, tag: string) {
  await user.type(dialog.getByRole('combobox', { name: label }), `${tag}{Enter}`);
}

async function addAttributeRow(user: UserEvent, dialog: Scope) {
  await user.click(dialog.getByRole('button', { name: 'Dodaj atribut' }));
}

describe('BulkEditDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-009-06: dialog ima razdelke Dodaj značke, Odstrani značke in Nastavi atribut ter gumba Uporabi in Prekliči', async () => {
    const { dialog } = await openDialog();

    expect(dialog.getByRole('combobox', { name: 'Dodaj značke' })).toBeInTheDocument();
    expect(dialog.getByRole('combobox', { name: 'Odstrani značke' })).toBeInTheDocument();
    expect(dialog.getByRole('group', { name: 'Nastavi atribut' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Dodaj atribut' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Prekliči' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Uredi izbrane kontakte (12)' }),
    ).toBeInTheDocument();
  });

  it.each([
    [1, 'Uporabi za 1 kontakt'],
    [2, 'Uporabi za 2 kontakta'],
    [3, 'Uporabi za 3 kontakte'],
    [5, 'Uporabi za 5 kontaktov'],
  ])('FR-009-06: pri %i izbranih se gumb glasi »%s«', async (count, name) => {
    const { dialog } = await openDialog(count);

    expect(dialog.getByRole('button', { name })).toBeInTheDocument();
  });

  it('FR-009-07: vrstica atributa ponuja Naslov, E-naslov, Telefon in Dodatni atribut – brez Ime in Priimek', async () => {
    const { user, dialog } = await openDialog();

    await addAttributeRow(user, dialog);

    const field = dialog.getByRole('combobox', { name: 'Atribut 1' });
    expect(
      within(field)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Naslov', 'E-naslov', 'Telefon', 'Dodatni atribut']);
    expect(dialog.queryByRole('textbox', { name: 'Ključ 1' })).not.toBeInTheDocument();
    expect(dialog.getByRole('textbox', { name: 'Vrednost 1' })).toHaveAccessibleDescription(
      'Prazna vrednost atribut odstrani.',
    );

    await user.selectOptions(field, 'Dodatni atribut');
    expect(dialog.getByRole('textbox', { name: 'Ključ 1' })).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Odstrani atribut 1' }));
    expect(dialog.queryByRole('combobox', { name: 'Atribut 1' })).not.toBeInTheDocument();
  });

  it('FR-009-06: »Uporabi« pošlje preverjanje in nato operacijo s telesom po pogodbi (značke, dodatni atribut)', async () => {
    const { user, dialog, api, all } = await openDialog();
    await addTag(user, dialog, 'Dodaj značke', 'nova');
    await addTag(user, dialog, 'Odstrani značke', 'staro');
    await addAttributeRow(user, dialog);
    await user.selectOptions(
      dialog.getByRole('combobox', { name: 'Atribut 1' }),
      'Dodatni atribut',
    );
    await user.type(dialog.getByRole('textbox', { name: 'Ključ 1' }), 'podjetje');
    await user.type(dialog.getByRole('textbox', { name: 'Vrednost 1' }), 'FERI');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(1));
    const posts = api.requests.filter((r) => r.method === 'POST').map((r) => r.path);
    expect(posts).toEqual([CHECK, UPDATE]);
    const body = api.recordedBodies(UPDATE)[0] as {
      contactIds: string[];
      addTags: string[];
      removeTags: string[];
      attributes: { field: string; key?: string; value: string }[];
    };
    expect(new Set(body.contactIds)).toEqual(new Set(all.map((contact) => contact.id)));
    expect(body.contactIds).toHaveLength(12);
    expect(body.addTags).toEqual(['nova']);
    expect(body.removeTags).toEqual(['staro']);
    expect(body.attributes).toEqual([{ field: 'custom', key: 'podjetje', value: 'FERI' }]);
  });

  it('FR-009-07: predefinirano polje se pošlje brez ključa; prazna vrednost je dovoljena (odstrani)', async () => {
    const { user, dialog, api } = await openDialog(3);
    await addAttributeRow(user, dialog);
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Atribut 1' }), 'Telefon');
    await user.type(dialog.getByRole('textbox', { name: 'Vrednost 1' }), '01 234 56 78');
    await addAttributeRow(user, dialog);
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Atribut 2' }), 'E-naslov');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 3 kontakte' }));

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(1));
    const body = api.recordedBodies(UPDATE)[0] as { attributes: unknown[] };
    expect(body.attributes).toEqual([
      { field: 'phone', value: '01 234 56 78' },
      { field: 'email', value: '' },
    ]);
  });

  it('FR-009-12: uspeh – dialog se zapre, obvestilo »Posodobljenih 10 kontaktov.«, seznam se osveži, izbor ostane', async () => {
    const { user, dialog, api } = await openDialog(12, {
      contacts: { bulkUpdate: () => bulkUpdateReply(10) },
    });
    const listRequestsBefore = listQueries(api).length;
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Posodobljenih 10 kontaktov.',
      ),
    );
    await waitFor(() => expect(listQueries(api).length).toBeGreaterThan(listRequestsBefore));
    await expectCount('Izbranih: 12');
  });

  it('FR-009-12: nobenega spremenjenega kontakta – »Nobenega kontakta ni bilo treba spremeniti.«', async () => {
    const { user, dialog } = await openDialog(12, {
      contacts: { bulkUpdate: () => bulkUpdateReply(0) },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Nobenega kontakta ni bilo treba spremeniti.',
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    [1, 'Posodobljen 1 kontakt.'],
    [2, 'Posodobljena 2 kontakta.'],
    [3, 'Posodobljeni 3 kontakti.'],
    [5, 'Posodobljenih 5 kontaktov.'],
  ])('FR-009-12: %i spremenjenih – obvestilo »%s«', async (changed, text) => {
    const { user, dialog } = await openDialog(12, {
      contacts: { bulkUpdate: () => bulkUpdateReply(changed) },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(text),
    );
  });

  it('FR-009-17: med pošiljanjem je gumb aria-disabled z »Uporabljam…« in drugi klik ne pošlje drugega zahtevka', async () => {
    const pending = deferred<Reply>();
    const { user, dialog, api } = await openDialog(12, {
      contacts: { bulkUpdate: () => pending.promise },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));
    const busy = await dialog.findByRole('button', { name: 'Uporabljam…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await user.click(busy);

    expect(api.recordedBodies(UPDATE)).toHaveLength(1);
    pending.resolve(bulkUpdateReply(12));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.recordedBodies(UPDATE)).toHaveLength(1);
  });

  it('FR-009-09 FR-009-17: napaka pri enem kontaktu – ime in razlog v alertu, dialog odprt, vnosi ohranjeni', async () => {
    const { user, dialog } = await openDialog(12, {
      contacts: {
        bulkUpdate: () =>
          bulkValidationReply(
            [],
            [
              {
                contactId: 'x',
                displayName: 'Mojca Kralj',
                errors: [{ field: 'tags', code: 'TOO_MANY' }],
              },
            ],
          ),
      },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Sprememb ni bilo mogoče uporabiti. Pri 1 kontaktu bi bilo preveč značk: Mojca Kralj.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Odstrani značko nova' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('FR-009-09 FR-009-17: napake pri 12 kontaktih – prvih 10 imen in »… in še 2«', async () => {
    const failing = Array.from({ length: 12 }, (_, i) => ({
      contactId: `id${i}`,
      displayName: displayName(i + 1),
      errors: [{ field: 'tags', code: 'TOO_MANY' }],
    }));
    const { user, dialog } = await openDialog(12, {
      contacts: { bulkUpdate: () => bulkValidationReply([], failing) },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    const alert = await dialog.findByRole('alert');
    for (let n = 1; n <= 10; n += 1) expect(alert).toHaveTextContent(displayName(n));
    expect(alert).not.toHaveTextContent(displayName(11));
    expect(alert).not.toHaveTextContent(displayName(12));
    expect(alert).toHaveTextContent('… in še 2');
    expect(alert).toHaveTextContent('preveč značk');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('FR-009-09: napaka pri 50 atributih navede preveč dodatnih atributov', async () => {
    const { user, dialog } = await openDialog(12, {
      contacts: {
        bulkUpdate: () =>
          bulkValidationReply(
            [],
            [
              {
                contactId: 'x',
                displayName: 'Mojca Kralj',
                errors: [{ field: 'attributes', code: 'TOO_MANY' }],
              },
            ],
          ),
      },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    const alert = await dialog.findByRole('alert');
    expect(alert).toHaveTextContent('Mojca Kralj');
    expect(alert).toHaveTextContent('preveč dodatnih atributov');
  });

  it('FR-009-17: napaka polja attributes[0].value – napaka ob polju »Vrednost 1«, dialog odprt', async () => {
    const { user, dialog } = await openDialog(12, {
      contacts: {
        bulkUpdate: () =>
          bulkValidationReply([{ field: 'attributes[0].value', code: 'INVALID_VALUE' }]),
      },
    });
    await addAttributeRow(user, dialog);
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Atribut 1' }), 'E-naslov');
    await user.type(dialog.getByRole('textbox', { name: 'Vrednost 1' }), 'ni-veljaven');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    await waitFor(() => expect(dialog.getByRole('textbox', { name: 'Vrednost 1' })).toBeInvalid());
    expect(dialog.getByRole('textbox', { name: 'Vrednost 1' })).toHaveValue('ni-veljaven');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each([
    ['403', forbiddenReply(), 'Za to dejanje nimaš več pravic.'],
    ['409 GROUP_ARCHIVED', archivedReply(), 'Skupina je arhivirana. Spreminjanje ni mogoče.'],
    ['omrežna napaka', 'network-error' as const, 'Strežnik ni dosegljiv. Poskusi znova.'],
  ])(
    'FR-009-17: %s – alert brez tehničnih kod, dialog odprt z vnosi',
    async (_name, reply, text) => {
      const { user, dialog } = await openDialog(12, { contacts: { bulkUpdate: () => reply } });
      await addTag(user, dialog, 'Dodaj značke', 'nova');

      await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

      const alert = await dialog.findByRole('alert');
      expect(alert).toHaveTextContent(text);
      expect(alert).not.toHaveTextContent(/FORBIDDEN|GROUP_ARCHIVED|SELECTION_CHANGED|VALIDATION/);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Odstrani značko nova' })).toBeInTheDocument();
    },
  );

  it('FR-009-17: omrežna napaka – alert ima gumb »Poskusi znova«', async () => {
    const { user, dialog } = await openDialog(12, {
      contacts: { bulkUpdate: () => 'network-error' },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');

    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));

    const alert = await dialog.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Poskusi znova' })).toBeInTheDocument();
  });

  it('FR-009-15 FR-009-17: po 403 (vloga znižana na bralca) akcij pisanja ni več, izbor ostane', async () => {
    let downgraded = false;
    const { user, dialog } = await openDialog(12, {
      contacts: {
        bulkUpdate: () => {
          downgraded = true;
          return forbiddenReply();
        },
      },
      groups: {
        get: (id) => ({
          status: 200,
          body: groupDetail({
            id,
            role: downgraded ? 'VIEWER' : 'EDITOR',
          }) as unknown as JsonBodyType,
        }),
      },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');
    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));
    await dialog.findByRole('alert');

    await user.click(dialog.getByRole('button', { name: 'Prekliči' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const bar = await actionBar();
    await waitFor(() =>
      expect(bar.queryByRole('button', { name: 'Uredi izbrane' })).not.toBeInTheDocument(),
    );
    expect(bar.queryByRole('button', { name: 'Izbriši' })).not.toBeInTheDocument();
    await expectCount('Izbranih: 12');
  });

  it('FR-009-15 FR-009-17: po 409 GROUP_ARCHIVED akcij pisanja ni več, izbor ostane, pasica arhivirane skupine je vidna', async () => {
    let archived = false;
    const { user, dialog } = await openDialog(12, {
      contacts: {
        bulkUpdate: () => {
          archived = true;
          return archivedReply();
        },
      },
      groups: {
        get: (id) => ({
          status: 200,
          body: groupDetail({ id, role: 'EDITOR', archived }) as unknown as JsonBodyType,
        }),
      },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');
    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));
    await dialog.findByRole('alert');

    await user.click(dialog.getByRole('button', { name: 'Prekliči' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const bar = await actionBar();
    await waitFor(() =>
      expect(bar.queryByRole('button', { name: 'Uredi izbrane' })).not.toBeInTheDocument(),
    );
    expect(bar.queryByRole('button', { name: 'Izbriši' })).not.toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Stanje skupine' })).toBeInTheDocument();
    await expectCount('Izbranih: 12');
  });

  it.each(['Dodaj značke', 'Odstrani značke'])(
    'FR-009-06: 31. značka v »%s« se ne doda, napaka ob polju (največ 30)',
    async (label) => {
      const { user, dialog } = await openDialog();
      const tags = Array.from({ length: 31 }, (_, i) => `z${String(i + 1).padStart(2, '0')}`);

      for (const tag of tags) await addTag(user, dialog, label, tag);

      const field = dialog.getByRole('combobox', { name: label });
      expect(field).toBeInvalid();
      expect(field).toHaveAccessibleDescription('Dodaš lahko največ 30 značk.');
      expect(dialog.queryByRole('button', { name: 'Odstrani značko z31' })).not.toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Odstrani značko z30' })).toBeInTheDocument();
    },
  );

  it('FR-009-06: po 10 vrsticah atributov »Dodaj atribut« ni več na voljo', async () => {
    const { user, dialog } = await openDialog();

    for (let n = 0; n < 10; n += 1) await addAttributeRow(user, dialog);

    expect(dialog.getByRole('combobox', { name: 'Atribut 10' })).toBeInTheDocument();
    const add = dialog.queryByRole('button', { name: 'Dodaj atribut' });
    expect(
      add === null || add.hasAttribute('disabled') || add.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
  });

  it('FR-009-06: Prekliči in Esc zapreta dialog brez zahtevka; izbor ostane', async () => {
    const { user, dialog, api } = await openDialog();

    await user.click(dialog.getByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click((await actionBar()).getByRole('button', { name: 'Uredi izbrane' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    await expectCount('Izbranih: 12');
  });

  it('FR-009-06: en vmesnik – angleška imena razdelkov in gumba', async () => {
    await i18n.changeLanguage('en');
    const view = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: { list: (url) => contactPageReply([contactSummary(1), contactSummary(2)])(url) },
    });
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    await view.user.click(await screen.findByRole('checkbox', { name: 'Select all on page' }));
    await view.user.click(
      within(await screen.findByRole('toolbar', { name: 'Selection actions' })).getByRole(
        'button',
        {
          name: 'Edit selected',
        },
      ),
    );

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Edit selected contacts (2)' }),
    );

    expect(dialog.getByRole('combobox', { name: 'Add tags' })).toBeInTheDocument();
    expect(dialog.getByRole('combobox', { name: 'Remove tags' })).toBeInTheDocument();
    expect(dialog.getByRole('group', { name: 'Set attribute' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Add attribute' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Apply to 2 contacts' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('FR-009-06: brez kršitev axe (sl) – dialog z vrstico atributa', async () => {
    const { user, dialog } = await openDialog();
    await addAttributeRow(user, dialog);

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('FR-009-17: brez kršitev axe (sl) – dialog z napako nad obrazcem', async () => {
    const { user, dialog } = await openDialog(12, {
      contacts: { bulkUpdate: () => forbiddenReply() },
    });
    await addTag(user, dialog, 'Dodaj značke', 'nova');
    await user.click(dialog.getByRole('button', { name: 'Uporabi za 12 kontaktov' }));
    await dialog.findByRole('alert');

    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('FR-009-06: brez kršitev axe (en) – dialog', async () => {
    await i18n.changeLanguage('en');
    const view = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: { list: (url) => contactPageReply([contactSummary(1)])(url) },
    });
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    await view.user.click(await screen.findByRole('checkbox', { name: 'Select all on page' }));
    await view.user.click(
      within(await screen.findByRole('toolbar', { name: 'Selection actions' })).getByRole(
        'button',
        {
          name: 'Edit selected',
        },
      ),
    );
    await screen.findByRole('dialog', { name: 'Edit selected contacts (1)' });

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
