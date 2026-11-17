import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  apiKey,
  apiKeyCreated,
  apiKeyNames,
  KLUB_ID,
  mockApiKeysApi,
  replies,
  TOKEN,
} from '../../test/apiKeysApi';
import {
  archivedReply,
  archivedSummary,
  groupId,
  listReply,
  mockGroupsApi,
  summary,
} from '../../test/groupsApi';
import { renderAccountApp } from '../../test/myDataApi';
import { tr } from '../../test/smartAttributes';

// Dialog *Nov API ključ* in enkraten prikaz ključa (FR-019-01; design.md 8.2, 8.10).

const ZBOR_ID = groupId(2);

function mockGroups() {
  mockGroupsApi({
    list: listReply({
      OWNER: [summary(1, { id: KLUB_ID, title: 'Klub' })],
      VIEWER: [summary(2, { id: ZBOR_ID, title: 'Zbor' })],
    }),
    listArchived: archivedReply([archivedSummary(3, { title: 'Arhiv 2025' })]),
  });
}

async function openDialog(user: UserEvent): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: apiKeyNames.create() }));
  return screen.findByRole('dialog', { name: apiKeyNames.dialog() });
}

describe('Nov API ključ (FR-019-01)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('brez imena in skupine pokaže napaki ob poljih in ne pošlje zahtevka', async () => {
    mockGroups();
    const api = mockApiKeysApi();
    const { user } = renderAccountApp();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: apiKeyNames.submit() }));

    const name = within(dialog).getByLabelText(apiKeyNames.name());
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(
      `${tr('apiKeys.form.nameRequired')} ${tr('apiKeys.form.nameHint')}`,
    );
    expect(
      within(dialog).getByRole('group', { name: apiKeyNames.groups() }),
    ).toHaveAccessibleDescription(tr('apiKeys.form.groupsRequired'));
    expect(api.createRequests()).toHaveLength(0);
  });

  it('izbrane skupine s pravico in rokom; ključ je prikazan enkrat in po zaprtju ga ni več', async () => {
    mockGroups();
    let created = false;
    const api = mockApiKeysApi({
      list: () => replies.list(created ? [apiKey()] : []),
      create: () => {
        created = true;
        return replies.created(apiKeyCreated(apiKey()));
      },
    });
    const { user, container } = renderAccountApp();

    const dialog = await openDialog(user);
    expect(within(dialog).getByRole('radio', { name: apiKeyNames.scopeSelected() })).toBeChecked();
    expect(
      await within(dialog).findByRole('checkbox', {
        name: tr('apiKeys.form.archivedGroup', { title: 'Arhiv 2025' }),
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: apiKeyNames.expiry() })).toHaveDisplayValue(
      tr('apiKeys.form.expiry90'),
    );
    await user.type(within(dialog).getByLabelText(apiKeyNames.name()), '  Nočni izvoz ');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Klub' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Zbor' }));
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: apiKeyNames.permissionFor('Zbor') }),
      apiKeyNames.permission('WRITE'),
    );
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: apiKeyNames.expiry() }),
      tr('apiKeys.form.expiry365'),
    );
    expect((await axe(container)).violations).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: apiKeyNames.submit() }));

    const shown = await screen.findByRole('dialog', { name: apiKeyNames.created('Nočni izvoz') });
    expect(api.createRequests()[0]?.body).toEqual({
      name: 'Nočni izvoz',
      allGroups: false,
      groups: [
        { groupId: KLUB_ID, permission: 'READ' },
        { groupId: ZBOR_ID, permission: 'WRITE' },
      ],
      expiresInDays: 365,
    });
    expect(within(shown).getByLabelText(apiKeyNames.key())).toHaveValue(TOKEN);
    expect(shown).toHaveTextContent(tr('apiKeys.createdDialog.showOnce'));
    await user.click(within(shown).getByRole('button', { name: apiKeyNames.copy() }));
    await expect(navigator.clipboard.readText()).resolves.toBe(TOKEN);
    expect((await axe(container)).violations).toEqual([]);

    await user.click(within(shown).getByRole('button', { name: apiKeyNames.close() }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body).not.toHaveTextContent(TOKEN);
    await waitFor(() =>
      expect(screen.getByRole('list', { name: apiKeyNames.list() })).toHaveTextContent(
        'Nočni izvoz',
      ),
    );
  });

  it('»vse moje skupine« z eno pravico in brez roka', async () => {
    mockGroups();
    const api = mockApiKeysApi();
    const { user } = renderAccountApp();

    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(apiKeyNames.name()), 'Skripta');
    await user.click(within(dialog).getByRole('radio', { name: apiKeyNames.scopeAll() }));
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: apiKeyNames.permissionAll() }),
      apiKeyNames.permission('WRITE'),
    );
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: apiKeyNames.expiry() }),
      tr('apiKeys.form.expiryNever'),
    );
    await user.click(within(dialog).getByRole('button', { name: apiKeyNames.submit() }));

    await waitFor(() =>
      expect(api.createRequests()[0]?.body).toEqual({
        name: 'Skripta',
        allGroups: true,
        allGroupsPermission: 'WRITE',
        expiresInDays: null,
      }),
    );
  });

  it.each([
    ['meja 10 ključev', replies.limit, 'apiKeys.form.limit'],
    ['skupina ni več na voljo', replies.groupNotFound, 'apiKeys.form.groupNotFound'],
    ['napaka strežnika', replies.serverError, 'apiKeys.form.failed'],
    ['brez povezave', replies.networkError, 'groups.offline'],
  ] as const)('%s: sporočilo ostane v dialogu', async (_, reply, message) => {
    mockGroups();
    mockApiKeysApi({ create: reply });
    const { user } = renderAccountApp();

    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(apiKeyNames.name()), 'Enajsti');
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Klub' }));
    await user.click(within(dialog).getByRole('button', { name: apiKeyNames.submit() }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(tr(message));
    expect(screen.getByRole('dialog', { name: apiKeyNames.dialog() })).toBeInTheDocument();
  });
});
