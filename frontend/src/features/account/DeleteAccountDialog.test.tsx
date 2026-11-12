import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  accountRegion,
  blockingGroup,
  confirmDeletion,
  deferredReply,
  openDeleteDialog,
  renderAccountApp,
  replies,
} from '../../test/myDataApi';
import { currentLocation } from '../../test/renderApp';

const MISMATCH_SL = 'Vpisani e-naslov se ne ujema z tvojim.';
const FAILED_SL = 'Računa ni bilo mogoče izbrisati. Poskusi znova.';
const OWNS_SL =
  'Račun ne more biti izbrisan, ker si medtem postal lastnik nearhivirane skupine. Prenesi lastništvo ali arhiviraj te skupine.';
const label = 'Za potrditev vpiši svoj e-naslov';

describe('DeleteAccountDialog – potrditev izbrisa z vpisom e-naslova', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-012-07: klik na »Izbriši račun« odpre dialog z razlago, poljem za e-naslov in fokusom na »Prekliči«', async () => {
    const { user } = renderAccountApp();

    const dialog = await openDeleteDialog(user);

    expect(dialog).toBeVisible();
    expect(dialog).toHaveTextContent(/Izbris je nepovraten\./);
    expect(within(dialog).getByRole('textbox', { name: label })).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Izbriši račun' })).toBeVisible();
  });

  it('FR-012-07: dialog v angleščini (»Delete account?«, »Cancel«, fokus na »Cancel«)', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    const { user } = renderAccountApp();

    const region = await screen.findByRole('region', { name: 'Delete account' });
    await user.click(await within(region).findByRole('button', { name: 'Delete account' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete account?' });
    expect(
      within(dialog).getByRole('textbox', { name: 'Type your email address to confirm' }),
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it.each([
    ['prazen vpis', ''],
    ['napačen e-naslov', 'druga@primer.si'],
  ])(
    'FR-012-07: %s – napaka ob polju (aria-invalid, aria-describedby), zahtevek se ne pošlje',
    async (_label, typed) => {
      const { user, api } = renderAccountApp();
      const dialog = await openDeleteDialog(user);

      await confirmDeletion(user, dialog, typed);

      const field = within(dialog).getByRole('textbox', { name: label });
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(MISMATCH_SL);
      expect(dialog).toHaveTextContent(MISMATCH_SL);
      expect(api.deletionRequests()).toHaveLength(0);
      expect(screen.getByRole('dialog', { name: 'Izbrišem račun?' })).toBeVisible();
    },
  );

  it('FR-012-07: Esc zapre dialog in vrne fokus na gumb »Izbriši račun«', async () => {
    const { user, api } = renderAccountApp();
    const dialog = await openDeleteDialog(user);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const region = await accountRegion('Izbris računa');
    expect(within(region).getByRole('button', { name: 'Izbriši račun' })).toHaveFocus();
    expect(api.deletionRequests()).toHaveLength(0);
  });

  it('FR-012-07: »Prekliči« zapre dialog in vrne fokus na gumb »Izbriši račun«', async () => {
    const { user, api } = renderAccountApp();
    const dialog = await openDeleteDialog(user);
    await user.type(within(dialog).getByRole('textbox', { name: label }), 'ana@primer.si');

    await user.click(within(dialog).getByRole('button', { name: 'Prekliči' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const region = await accountRegion('Izbris računa');
    expect(within(region).getByRole('button', { name: 'Izbriši račun' })).toHaveFocus();
    expect(api.deletionRequests()).toHaveLength(0);
  });

  it('FR-012-07: ponovno odprt dialog je prazen in brez napake', async () => {
    const { user } = renderAccountApp();
    const first = await openDeleteDialog(user);
    await confirmDeletion(user, first, 'druga@primer.si');
    await user.click(within(first).getByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(first).not.toBeInTheDocument());

    const second = await openDeleteDialog(user);

    const field = within(second).getByRole('textbox', { name: label });
    expect(field).toHaveValue('');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    expect(second).not.toHaveTextContent(MISMATCH_SL);
  });

  it('FR-012-07: pravilen vpis z drugačnimi velikimi črkami in presledki pošlje POST /api/me/deletion z {"email"}', async () => {
    const { user, api } = renderAccountApp();
    const dialog = await openDeleteDialog(user);

    await confirmDeletion(user, dialog, '  ANA@Primer.SI ');

    await waitFor(() => expect(api.deletionRequests()).toHaveLength(1));
    const request = api.deletionRequests()[0];
    expect(request?.method).toBe('POST');
    expect(request?.authorization).toBe('Bearer token-uid-ana');
    const body = request?.body as { email: string };
    expect(Object.keys(body)).toEqual(['email']);
    expect(body.email.trim().toLowerCase()).toBe('ana@primer.si');
  });

  it('FR-012-17: 204 → odjava in prijava z razlogom account-deleted', async () => {
    const { user, gateway } = renderAccountApp({ deletion: replies.deleted });
    const dialog = await openDeleteDialog(user);

    await confirmDeletion(user, dialog);

    await waitFor(() => expect(currentLocation()).toBe('/login?reason=account-deleted'));
    expect(gateway.signOutCalls).toBe(1);
  });

  it('FR-012-17: 202 → prijava z razlogom account-deleted-pending', async () => {
    const { user, gateway } = renderAccountApp({ deletion: replies.pending });
    const dialog = await openDeleteDialog(user);

    await confirmDeletion(user, dialog);

    await waitFor(() => expect(currentLocation()).toBe('/login?reason=account-deleted-pending'));
    expect(gateway.signOutCalls).toBe(1);
  });

  it('FR-012-13: 409 OWNS_ACTIVE_GROUPS zapre dialog, pokaže alert, osveži seznam iz telesa in fokusira naslov razdelka', async () => {
    const groups = [blockingGroup(1), blockingGroup(2)];
    const { user, api, gateway } = renderAccountApp({
      deletion: replies.ownsActiveGroups(groups),
    });
    const dialog = await openDeleteDialog(user);

    await confirmDeletion(user, dialog);

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const region = await accountRegion('Izbris računa');
    expect(await within(region).findByRole('alert')).toHaveTextContent(OWNS_SL);
    const list = within(region).getByRole('list', {
      name: 'Skupine, ki preprečujejo izbris računa',
    });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Skupina 001', 'Skupina 002']);
    expect(within(region).queryByRole('button', { name: 'Izbriši račun' })).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { level: 2, name: 'Izbris računa' })).toHaveFocus();
    // Seznam je iz telesa 409, ne iz novega klica.
    expect(api.blockerRequests()).toHaveLength(1);
    expect(gateway.signOutCalls).toBe(0);
    expect(currentLocation()).toBe('/account');
  });

  it('FR-012-07: 400 MISMATCH pokaže napako ob polju, dialog ostane odprt', async () => {
    const { user, api } = renderAccountApp({ deletion: replies.mismatch });
    const dialog = await openDeleteDialog(user);

    await confirmDeletion(user, dialog);

    await waitFor(() => expect(api.deletionRequests()).toHaveLength(1));
    const field = within(dialog).getByRole('textbox', { name: label });
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription(MISMATCH_SL);
    expect(dialog).toBeInTheDocument();
    expect(currentLocation()).toBe('/account');
  });

  it.each([
    ['napaka zaledja 500', replies.serverError],
    ['brez povezave', replies.networkError],
  ] as const)(
    'FR-012-07: %s – alert »Računa ni bilo mogoče izbrisati. Poskusi znova.«, dialog ostane odprt',
    async (_label, failure) => {
      const { user, api, gateway } = renderAccountApp({ deletion: failure });
      const dialog = await openDeleteDialog(user);

      await confirmDeletion(user, dialog);

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(FAILED_SL);
      expect(dialog).toBeInTheDocument();
      expect(currentLocation()).toBe('/account');
      expect(gateway.signOutCalls).toBe(0);
      expect(api.deletionRequests()).toHaveLength(1);
      expect(within(dialog).getByRole('button', { name: 'Izbriši račun' })).not.toHaveAttribute(
        'aria-busy',
        'true',
      );
    },
  );

  it('FR-012-07: napaka v angleščini – »Your account could not be deleted. Please try again.«', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    const { user } = renderAccountApp({ deletion: replies.serverError });
    const region = await screen.findByRole('region', { name: 'Delete account' });
    await user.click(await within(region).findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete account?' });

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Type your email address to confirm' }),
      'ana@primer.si',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Your account could not be deleted. Please try again.',
    );
  });

  it('FR-012-07: med klicem je potrditveni gumb aria-busy in zahtevek se ne podvoji', async () => {
    const pending = deferredReply();
    const { user, api } = renderAccountApp({ deletion: pending.source });
    const dialog = await openDeleteDialog(user);

    await confirmDeletion(user, dialog);

    const confirm = within(dialog).getByRole('button', { name: 'Izbriši račun' });
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    await user.click(confirm);
    expect(api.deletionRequests()).toHaveLength(1);

    pending.release(replies.serverError);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(FAILED_SL);
    expect(confirm).not.toHaveAttribute('aria-busy', 'true');
  });

  it.each(['light', 'dark'] as const)(
    'FR-012-07: odprt dialog nima kršitev axe (tema %s; prazen, z napako polja, z napako strežnika)',
    async (theme) => {
      localStorage.setItem('theme', theme);
      document.documentElement.dataset.theme = theme;
      const { user } = renderAccountApp({ deletion: replies.serverError });
      const dialog = await openDeleteDialog(user);
      expect((await axe(document.body)).violations).toEqual([]);

      await confirmDeletion(user, dialog, 'druga@primer.si');
      await waitFor(() => expect(dialog).toHaveTextContent(MISMATCH_SL));
      expect((await axe(document.body)).violations).toEqual([]);

      await confirmDeletion(user, dialog);
      await within(dialog).findByRole('alert');
      expect((await axe(document.body)).violations).toEqual([]);
    },
  );
});
