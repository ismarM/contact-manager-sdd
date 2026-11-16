import { type BoundFunctions, type queries, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  bulkPath,
  bulkValidationReply,
  contactPageReply,
  contactSummaries,
  renderContactsApp,
  suggestionsServer,
} from '../../../test/contactsApi';
import { actionBar, headerBox, LIST, listReady } from '../../../test/selection';
import { typeName } from '../../../test/typedAttributesApi';

// Množično nastavljanje atributa s tipom (FR-016-06): izbira tipa novega ključa, vrednost po tipu, napake po vrednosti.

const UPDATE = bulkPath('bulk-update');

type Scope = BoundFunctions<typeof queries>;
type Options = Parameters<typeof renderContactsApp>[1];

async function openDialog(options: Options = {}) {
  const all = contactSummaries(3);
  const view = renderContactsApp(LIST, {
    role: 'EDITOR',
    ...options,
    contacts: { list: (url) => contactPageReply(all)(url), ...options.contacts },
  });
  await listReady();
  await view.user.click(headerBox());
  const bar = await actionBar();
  await view.user.click(bar.getByRole('button', { name: 'Uredi izbrane' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Uredi izbrane kontakte (3)' }));
  return { ...view, dialog };
}

async function customRow(user: UserEvent, dialog: Scope, key: string) {
  await user.click(dialog.getByRole('button', { name: 'Dodaj atribut' }));
  await user.selectOptions(dialog.getByRole('combobox', { name: 'Atribut 1' }), 'Dodatni atribut');
  await user.type(dialog.getByRole('combobox', { name: 'Ključ 1' }), key);
  await user.tab();
}

describe('BulkEditDialog – tipi ključev', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-016-06: nov ključ ima izbiro tipa, tip se pošlje, polje vrednosti sledi tipu', async () => {
    const { user, dialog, api } = await openDialog();
    await customRow(user, dialog, 'Pošta');

    await user.selectOptions(
      dialog.getByRole('combobox', { name: 'Tip novega ključa' }),
      typeName('EMAIL'),
    );
    expect(dialog.getByLabelText('Vrednost 1')).toHaveAttribute('type', 'email');
    await user.type(dialog.getByLabelText('Vrednost 1'), 'info@primer.si');
    await user.click(dialog.getByRole('button', { name: 'Uporabi za 3 kontakte' }));

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(1));
    expect((api.recordedBodies(UPDATE)[0] as { attributes: unknown[] }).attributes).toEqual([
      { field: 'custom', key: 'Pošta', type: 'EMAIL', value: 'info@primer.si' },
    ]);
  });

  it('FR-016-06: ključ skupine s tipom prevzame tip; tip se ne pošlje', async () => {
    const { user, dialog, api } = await openDialog({
      contacts: {
        suggestions: suggestionsServer({
          key: [{ text: 'Mobilni', count: 4, attributeType: 'PHONE' }],
        }),
      },
    });
    await customRow(user, dialog, 'mobilni');

    expect(await dialog.findByText(/Tip ključa v tej skupini je Telefon/)).toBeInTheDocument();
    expect(dialog.queryByRole('combobox', { name: 'Tip novega ključa' })).not.toBeInTheDocument();
    await user.type(dialog.getByLabelText('Vrednost 1'), '041 123 456');
    await user.click(dialog.getByRole('button', { name: 'Uporabi za 3 kontakte' }));

    await waitFor(() => expect(api.recordedBodies(UPDATE)).toHaveLength(1));
    expect((api.recordedBodies(UPDATE)[0] as { attributes: unknown[] }).attributes).toEqual([
      { field: 'custom', key: 'Mobilni', value: '041 123 456' },
    ]);
  });

  it('FR-016-06: neveljavna vrednost za tip – napaka ob vrednosti in imena kontaktov, dialog ostane', async () => {
    const { user, dialog } = await openDialog({
      contacts: {
        bulkUpdate: () =>
          bulkValidationReply(
            [],
            [
              {
                contactId: '0193c4a2-0000-7000-8000-000000000001',
                displayName: 'Kontakt 1',
                errors: [{ field: 'attributes[0].value', code: 'INVALID_VALUE' }],
              },
            ],
          ),
      },
    });
    await customRow(user, dialog, 'Datum');
    await user.selectOptions(
      dialog.getByRole('combobox', { name: 'Tip novega ključa' }),
      typeName('DATE'),
    );
    await user.type(dialog.getByLabelText('Vrednost 1'), '2026-01-01');
    await user.click(dialog.getByRole('button', { name: 'Uporabi za 3 kontakte' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kontakt 1');
    expect(dialog.getByLabelText('Vrednost 1')).toHaveAccessibleDescription(
      /Vpiši veljaven datum \(LLLL-MM-DD\)\./,
    );
    expect((await axe(screen.getByRole('dialog'))).violations).toEqual([]);
  });

  it('FR-016-06: tip, ki ni tip ključa v uporabi, je napaka ob izbiri tipa', async () => {
    const { user, dialog } = await openDialog({
      contacts: {
        bulkUpdate: () =>
          bulkValidationReply([{ field: 'attributes[0].type', code: 'INVALID_VALUE' }]),
      },
    });
    await customRow(user, dialog, 'Pošta');
    await user.selectOptions(
      dialog.getByRole('combobox', { name: 'Tip novega ključa' }),
      typeName('EMAIL'),
    );
    await user.type(dialog.getByLabelText('Vrednost 1'), 'info@primer.si');
    await user.click(dialog.getByRole('button', { name: 'Uporabi za 3 kontakte' }));

    await screen.findByRole('alert');
    expect(dialog.getByRole('combobox', { name: 'Tip novega ključa' })).toHaveAccessibleDescription(
      'Ključ že obstaja z drugim tipom. Izberi predlagani ključ ali drugo ime ključa.',
    );
  });
});
