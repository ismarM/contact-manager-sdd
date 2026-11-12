import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { groupDetail } from '../../test/groupsApi';
import {
  accountRegion,
  blockingGroup,
  deferredReply,
  renderAccountApp,
  replies,
} from '../../test/myDataApi';
import { server } from '../../test/msw';
import { currentLocation } from '../../test/renderApp';

const CONSEQUENCES_SL =
  'Izbris je nepovraten. Tvoji osebni podatki in prejeta povabila se izbrišejo, odstranjen boš iz vseh skupin, v arhiviranih skupinah, katerih lastnik si, in v revizijskih sledeh bo namesto tebe prikazan »izbrisan uporabnik«. Arhivirane skupine, v katerih si edini član, se izbrišejo.';
const CONSEQUENCES_EN =
  'Deletion is permanent. Your personal data and received invitations will be deleted, you will be removed from all groups, and "deleted user" will be shown instead of you in archived groups you own and in audit trails. Archived groups in which you are the only member will be deleted.';

describe('DeleteAccountSection – razdelek Izbris računa', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-012-05: region »Izbris računa« z razlago posledic (sl)', async () => {
    renderAccountApp();

    const region = await accountRegion('Izbris računa');
    expect(within(region).getByRole('heading', { level: 2, name: 'Izbris računa' })).toBeVisible();
    expect(region).toBeVisible();
    expect(region).toHaveTextContent(CONSEQUENCES_SL);
  });

  it('FR-012-05: region »Delete account« z razlago posledic (en)', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    renderAccountApp();

    const region = await screen.findByRole('region', { name: 'Delete account' });
    expect(region).toBeVisible();
    expect(region).toHaveTextContent(CONSEQUENCES_EN);
  });

  it('FR-012-06: brez blokirnih skupin je viden gumb »Izbriši račun«, seznama ni', async () => {
    const { api } = renderAccountApp({ blockers: replies.blockers([]) });

    const region = await accountRegion('Izbris računa');
    expect(await within(region).findByRole('button', { name: 'Izbriši račun' })).toBeEnabled();
    expect(within(region).queryByRole('list')).not.toBeInTheDocument();
    expect(api.blockerRequests()).toHaveLength(1);
    expect(api.blockerRequests()[0]?.authorization).toBe('Bearer token-uid-ana');
  });

  it('FR-012-06: med nalaganjem je status »Nalagam…« in gumba še ni', async () => {
    const pending = deferredReply();
    renderAccountApp({ blockers: pending.source });

    const region = await accountRegion('Izbris računa');
    expect(await within(region).findByRole('status')).toHaveTextContent('Nalagam…');
    expect(within(region).queryByRole('button', { name: 'Izbriši račun' })).not.toBeInTheDocument();

    pending.release(replies.blockers([]));

    expect(await within(region).findByRole('button', { name: 'Izbriši račun' })).toBeVisible();
    expect(within(region).queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['napaka zaledja 500', replies.serverError],
    ['brez povezave', replies.networkError],
  ] as const)(
    'FR-012-06: %s pri seznamu – alert in »Poskusi znova«, gumba ni; ponovni poskus pokaže gumb',
    async (_label, failure) => {
      const { user, api } = renderAccountApp({
        blockers: (call) => (call === 1 ? failure : replies.blockers([])),
      });

      const region = await accountRegion('Izbris računa');
      expect(await within(region).findByRole('alert')).toHaveTextContent(
        'Skupin, ki preprečujejo izbris, ni bilo mogoče naložiti. Poskusi znova.',
      );
      expect(
        within(region).queryByRole('button', { name: 'Izbriši račun' }),
      ).not.toBeInTheDocument();

      await user.click(within(region).getByRole('button', { name: 'Poskusi znova' }));

      expect(await within(region).findByRole('button', { name: 'Izbriši račun' })).toBeVisible();
      expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
      expect(api.blockerRequests()).toHaveLength(2);
    },
  );

  it('FR-012-06: lastnik dveh nearhiviranih skupin vidi seznam s povezavami in navodilo, brez gumba', async () => {
    const groups = [blockingGroup(1), blockingGroup(2)];
    renderAccountApp({ blockers: replies.blockers(groups) });

    const region = await accountRegion('Izbris računa');
    const list = await within(region).findByRole('list', {
      name: 'Skupine, ki preprečujejo izbris računa',
    });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Skupina 001', 'Skupina 002']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      groups.map((group) => `/groups/${group.id}`),
    );
    expect(region).toHaveTextContent('Prenesi lastništvo ali arhiviraj te skupine');
    expect(within(region).queryByRole('button', { name: 'Izbriši račun' })).not.toBeInTheDocument();
  });

  it('FR-012-06: seznam v angleščini', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    renderAccountApp({ blockers: replies.blockers([blockingGroup(1)]) });

    const region = await screen.findByRole('region', { name: 'Delete account' });
    expect(
      await within(region).findByRole('list', { name: 'Groups that prevent account deletion' }),
    ).toBeVisible();
    expect(region).toHaveTextContent('Transfer ownership or archive these groups');
    expect(
      within(region).queryByRole('button', { name: 'Delete account' }),
    ).not.toBeInTheDocument();
  });

  it('SC-007 FR-012-06: ena povezava = en klik do skupine', async () => {
    const group = blockingGroup(1);
    server.use(
      http.get('/api/groups/:groupId', ({ params }) =>
        HttpResponse.json(groupDetail({ id: String(params.groupId), title: group.title })),
      ),
    );
    const { user } = renderAccountApp({ blockers: replies.blockers([group]) });

    const region = await accountRegion('Izbris računa');
    await user.click(await within(region).findByRole('link', { name: group.title }));

    await waitFor(() => expect(currentLocation()).toMatch(new RegExp(`^/groups/${group.id}`)));
  });

  it('FR-012-06: po osvežitvi (skupina medtem arhivirana) seznam izgine in se prikaže gumb', async () => {
    const first = renderAccountApp({ blockers: replies.blockers([blockingGroup(1)]) });
    const region = await accountRegion('Izbris računa');
    await within(region).findByRole('list', { name: 'Skupine, ki preprečujejo izbris računa' });
    expect(within(region).queryByRole('button', { name: 'Izbriši račun' })).not.toBeInTheDocument();
    first.unmount();

    const second = renderAccountApp({ blockers: replies.blockers([]) });

    const refreshed = await accountRegion('Izbris računa');
    expect(await within(refreshed).findByRole('button', { name: 'Izbriši račun' })).toBeVisible();
    expect(within(refreshed).queryByRole('list')).not.toBeInTheDocument();
    expect(second.api.blockerRequests()).toHaveLength(1);
  });

  it.each(['light', 'dark'] as const)(
    'FR-012-05 FR-012-06: razdelek Izbris računa nima kršitev axe (tema %s; gumb, seznam, napaka)',
    async (theme) => {
      localStorage.setItem('theme', theme);
      document.documentElement.dataset.theme = theme;
      const withButton = renderAccountApp();
      await within(await accountRegion('Izbris računa')).findByRole('button', {
        name: 'Izbriši račun',
      });
      expect((await axe(withButton.container)).violations).toEqual([]);
      withButton.unmount();

      const withList = renderAccountApp({ blockers: replies.blockers([blockingGroup(1)]) });
      await within(await accountRegion('Izbris računa')).findByRole('list');
      expect((await axe(withList.container)).violations).toEqual([]);
      withList.unmount();

      const withError = renderAccountApp({ blockers: replies.serverError });
      await within(await accountRegion('Izbris računa')).findByRole('alert');
      expect((await axe(withError.container)).violations).toEqual([]);
    },
  );
});
