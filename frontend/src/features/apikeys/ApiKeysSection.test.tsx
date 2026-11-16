import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { apiKey, apiKeyNames, keyId, mockApiKeysApi, replies } from '../../test/apiKeysApi';
import { renderAccountApp } from '../../test/myDataApi';
import { tr } from '../../test/smartAttributes';

// Razdelek *API ključi* v *Mojem računu* (FR-019-01 … -04; design.md 8.5, 8.11, 9.9).

const section = () => screen.findByRole('region', { name: apiKeyNames.section() });

describe('Razdelek API ključi (FR-019-01 … -04)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('seznam kaže ime, prepoznavni del, skupine s pravico, čase in stanje – nikoli ključa', async () => {
    mockApiKeysApi({
      list: replies.list([
        apiKey(),
        apiKey({
          id: keyId(2),
          name: 'Skripta',
          allGroups: true,
          allGroupsPermission: 'WRITE',
          groups: [],
          expiresAt: null,
          lastUsedAt: '2026-11-16T09:00:00Z',
          requestsLast24h: 3,
        }),
        apiKey({
          id: keyId(3),
          name: 'Stari',
          status: 'REVOKED',
          revokedAt: '2026-11-10T08:00:00Z',
        }),
        apiKey({ id: keyId(4), name: 'Kmalu', expiringSoon: true }),
        apiKey({ id: keyId(5), name: 'Osirotel', groups: [] }),
      ]),
    });
    const { container } = renderAccountApp();

    const list = await screen.findByRole('list', { name: apiKeyNames.list() });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    const [first, second, revoked, soon, orphan] = items as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(first).toHaveTextContent('Nočni izvoz');
    expect(first).toHaveTextContent('cmk_…x7Qa9Z');
    expect(first).toHaveTextContent(
      tr('apiKeys.groupWithPermission', {
        title: 'Klub',
        permission: apiKeyNames.permission('READ'),
      }),
    );
    expect(first).toHaveTextContent(tr('apiKeys.neverUsed'));
    expect(first).toHaveTextContent(tr('apiKeys.status.ACTIVE'));
    expect(
      within(first).getByRole('button', { name: apiKeyNames.revoke('Nočni izvoz') }),
    ).toBeVisible();
    expect(
      within(first).getByRole('link', { name: apiKeyNames.usageLink('Nočni izvoz') }),
    ).toHaveAttribute('href', `/account/api-keys/${keyId(1)}`);
    expect(second).toHaveTextContent(
      tr('apiKeys.allGroupsWithPermission', { permission: apiKeyNames.permission('WRITE') }),
    );
    expect(second).toHaveTextContent(tr('apiKeys.noExpiry'));
    expect(second).toHaveTextContent(tr('apiKeys.requests24h', { count: 3 }));
    expect(revoked).toHaveTextContent(tr('apiKeys.status.REVOKED'));
    expect(within(revoked).queryByRole('button')).not.toBeInTheDocument();
    expect(soon).toHaveTextContent(tr('apiKeys.status.expiringSoon'));
    expect(first).not.toHaveTextContent(tr('apiKeys.status.expiringSoon'));
    expect(orphan).toHaveTextContent(tr('apiKeys.noValidGroups'));
    expect(
      within(await section()).getByRole('link', { name: apiKeyNames.docsLink() }),
    ).toHaveAttribute('href', '/api-docs');
    expect(document.body).not.toHaveTextContent('cmk_fake');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('brez ključev pove, da jih še ni', async () => {
    mockApiKeysApi({ list: replies.list([]) });
    renderAccountApp();

    const region = await section();
    await waitFor(() => expect(region).toHaveTextContent(tr('apiKeys.empty')));
  });

  it('napaka nalaganja ponudi ponoven poskus', async () => {
    mockApiKeysApi({ list: (call) => (call === 1 ? replies.serverError : replies.list()) });
    const { user } = renderAccountApp();

    const alert = await within(await section()).findByRole('alert');
    expect(alert).toHaveTextContent(tr('apiKeys.loadFailed'));
    await user.click(within(alert).getByRole('button', { name: tr('apiKeys.retry') }));

    expect(await screen.findByRole('list', { name: apiKeyNames.list() })).toHaveTextContent(
      'Nočni izvoz',
    );
  });

  it('preklic zahteva potrditev s fokusom na varni izbiri; preklican ključ je označen', async () => {
    const api = mockApiKeysApi({
      list: (call) =>
        replies.list([
          call === 1 ? apiKey() : apiKey({ status: 'REVOKED', revokedAt: '2026-11-16T10:00:00Z' }),
        ]),
    });
    const { user, container } = renderAccountApp();

    await user.click(
      await screen.findByRole('button', { name: apiKeyNames.revoke('Nočni izvoz') }),
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: apiKeyNames.revokeDialog('Nočni izvoz'),
    });
    expect(within(dialog).getByRole('button', { name: apiKeyNames.revokeCancel() })).toHaveFocus();
    expect((await axe(container)).violations).toEqual([]);
    expect(api.revokeRequests()).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: apiKeyNames.revokeConfirm() }));

    await waitFor(() =>
      expect(api.revokeRequests().map((r) => r.path)).toEqual([`/api/me/api-keys/${keyId(1)}`]),
    );
    const list = await screen.findByRole('list', { name: apiKeyNames.list() });
    await waitFor(() => expect(list).toHaveTextContent(tr('apiKeys.status.REVOKED')));
  });

  it('neuspel preklic ostane v dialogu z napako', async () => {
    mockApiKeysApi({ revoke: replies.serverError });
    const { user } = renderAccountApp();

    await user.click(
      await screen.findByRole('button', { name: apiKeyNames.revoke('Nočni izvoz') }),
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: apiKeyNames.revokeDialog('Nočni izvoz'),
    });
    await user.click(within(dialog).getByRole('button', { name: apiKeyNames.revokeConfirm() }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(tr('apiKeys.revoke.failed'));
  });
});
