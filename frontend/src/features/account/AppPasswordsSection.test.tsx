import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { names, tr } from '../../test/importExport';
import { server } from '../../test/msw';
import { renderAccountApp } from '../../test/myDataApi';

const PASSWORD = 'abcd-efgh-jkmn-pqrs-tvwx-yz01-2345';

function mockPasswords(options: { createStatus?: number } = {}) {
  const items: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[] = [
    { id: 'p1', name: 'iPhone', createdAt: '2026-11-01T10:00:00Z', lastUsedAt: null },
  ];
  const deleted: string[] = [];
  server.use(
    http.get('/api/me/app-passwords', () => HttpResponse.json({ items })),
    http.post('/api/me/app-passwords', async ({ request }) => {
      if (options.createStatus === 409) {
        return HttpResponse.json({ code: 'APP_PASSWORD_LIMIT' }, { status: 409 });
      }
      const body = (await request.json()) as { name: string };
      const created = {
        id: 'p2',
        name: body.name,
        createdAt: '2026-11-15T10:00:00Z',
        lastUsedAt: null,
      };
      items.push(created);
      return HttpResponse.json(
        { ...created, password: PASSWORD, username: 'ana@primer.si' },
        { status: 201 },
      );
    }),
    http.delete('/api/me/app-passwords/:id', ({ params }) => {
      deleted.push(params.id as string);
      items.splice(
        items.findIndex((item) => item.id === params.id),
        1,
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { deleted };
}

describe('Gesla za aplikacijo (FR-014-21, -25, -27)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('seznam kaže ime in »še ni uporabljeno«, novo geslo je prikazano enkrat z naslovom strežnika', async () => {
    mockPasswords();
    const { container } = renderAccountApp();
    const user = userEvent.setup();

    const list = await screen.findByRole('list', { name: tr('account.appPasswords.list') });
    expect(within(list).getByText('iPhone')).toBeInTheDocument();
    expect(
      within(list).getByText(new RegExp(tr('account.appPasswords.neverUsed'))),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${window.location.origin}/dav/`))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: names.newPassword() }));
    await user.click(screen.getByRole('button', { name: names.createPassword() }));
    expect(screen.getByText(tr('account.appPasswords.nameRequired'))).toBeInTheDocument();
    await user.type(screen.getByLabelText(names.deviceName()), 'Telefon');
    await user.click(screen.getByRole('button', { name: names.createPassword() }));

    const dialog = await screen.findByRole('dialog', {
      name: tr('account.appPasswords.createdTitle', { name: 'Telefon' }),
    });
    expect(within(dialog).getByText(PASSWORD)).toBeInTheDocument();
    expect(within(dialog).getByText('ana@primer.si')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: names.close() }));

    await waitFor(() => expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument());
    expect(await screen.findByText('Telefon')).toBeInTheDocument();
  });

  it('enajsto geslo pove mejo; preklic zahteva potrditev', async () => {
    const { deleted } = mockPasswords({ createStatus: 409 });
    renderAccountApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: names.newPassword() }));
    await user.type(screen.getByLabelText(names.deviceName()), 'Preveč');
    await user.click(screen.getByRole('button', { name: names.createPassword() }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('account.appPasswords.limit'));
    await user.keyboard('{Escape}');

    await user.click(await screen.findByRole('button', { name: names.revoke('iPhone') }));
    const confirm = await screen.findByRole('dialog', {
      name: tr('account.appPasswords.revokeTitle', { name: 'iPhone' }),
    });
    expect(deleted).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: names.revokeConfirm() }));

    await waitFor(() => expect(deleted).toEqual(['p1']));
    expect(await screen.findByText(tr('account.appPasswords.empty'))).toBeInTheDocument();
  });
});
