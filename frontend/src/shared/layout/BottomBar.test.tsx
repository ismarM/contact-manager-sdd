import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { listReply, renderGroupsApp, summary } from '../../test/groupsApi';
import { server } from '../../test/msw';
import { navNames } from '../../test/names';
import { currentLocation } from '../../test/renderApp';
import { setViewport } from '../../test/viewport';

// Spodnja vrstica pod 640 px in ploskev pod 1024 px (FR-020-07; design.md 7.1).

const LIST = { OWNER: [summary(1, { title: 'Alfa' })] };

describe('BottomBar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('narrow');
  });

  it('FR-020-07: pod 640 px je navigacija spodnja vrstica z natanko štirimi postavkami', async () => {
    server.use(http.get('/api/invitations/count', () => HttpResponse.json({ count: 1 })));
    renderGroupsApp('/groups/archived', { list: listReply(LIST) });

    const bar = await screen.findByRole('navigation', { name: 'Glavna navigacija' });
    const links = within(bar).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/groups/archived',
      '/invitations',
      '/account',
    ]);
    expect(within(bar).getByRole('link', { name: navNames.groups() })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: navNames.archived() })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      await within(bar).findByRole('link', { name: navNames.invitationsNew(1) }),
    ).toBeVisible();
    expect(within(bar).getByRole('link', { name: 'Račun' })).not.toHaveAttribute('aria-current');
    expect(document.querySelector('aside')).toBeNull();
  });

  it('FR-020-07: postavka Račun odpre Moj račun in je označena', async () => {
    const { user } = renderGroupsApp('/', { list: listReply(LIST) });

    await user.click(await screen.findByRole('link', { name: 'Račun' }));

    await waitFor(() => expect(currentLocation()).toBe('/account'));
    expect(screen.getByRole('link', { name: 'Račun' })).toHaveAttribute('aria-current', 'page');
  });

  it('FR-020-07: od 640 px spodnje vrstice ni; stranska vrstica je ploskev z gumbom v zgornji vrstici', async () => {
    setViewport('tablet');
    const { user } = renderGroupsApp('/', { list: listReply(LIST) });

    const banner = await screen.findByRole('banner');
    expect(screen.queryByRole('navigation', { name: 'Glavna navigacija' })).not.toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Odpri navigacijo' }));

    const sheet = await screen.findByRole('dialog', { name: 'Navigacija' });
    const nav = within(sheet).getByRole('navigation', { name: 'Glavna navigacija' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(within(sheet).getByRole('button', { name: 'Meni računa' })).toBeInTheDocument();
    await user.click(within(nav).getByRole('link', { name: navNames.archived() }));

    await waitFor(() => expect(currentLocation()).toBe('/groups/archived'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('FR-020-09: v zgornji vrstici ni stikala teme', async () => {
    setViewport('tablet');
    renderGroupsApp('/', { list: listReply(LIST) });

    const banner = await screen.findByRole('banner');
    expect(within(banner).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(banner).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(banner).getAllByRole('button')).toHaveLength(2);
  });

  it.each(['sl', 'en'] as const)(
    'FR-020-07: spodnja vrstica nima kršitev axe (%s)',
    async (language) => {
      await i18n.changeLanguage(language);
      const { container } = renderGroupsApp('/', { list: listReply(LIST) });
      await screen.findByRole('navigation', {
        name: language === 'sl' ? 'Glavna navigacija' : 'Main navigation',
      });

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
