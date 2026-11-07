import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  groupDetail,
  groupId,
  listReply,
  renderGroupsApp,
  summaries,
  summary,
} from '../../test/groupsApi';
import { currentLocation } from '../../test/renderApp';
import { setViewport } from '../../test/viewport';

// Meni za preklop skupine pri širini < 1024 px (FR-002-06; design.md 7.1, 8.16; plan.md – Key elements).

const BY_ROLE = {
  OWNER: [summary(1, { title: 'Alfa' }), summary(2, { title: 'Beta' })],
  ADMIN: [summary(3, { title: 'Cvet' })],
  VIEWER: summaries(14, 100),
};

const detail = (id: string) => {
  const all = [...BY_ROLE.OWNER, ...BY_ROLE.ADMIN, ...BY_ROLE.VIEWER];
  const found = all.find((group) => group.id === id);
  return found
    ? { status: 200, body: groupDetail({ id, title: found.title, role: 'ADMIN' }) }
    : { status: 404 };
};

describe('GroupSwitcher', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('narrow');
  });

  it('FR-002-06: gumb v zgornji vrstici odpre meni z razdelki, največ 10 skupinami in »Vse skupine«', async () => {
    const { user } = renderGroupsApp('/', { list: listReply(BY_ROLE), get: detail });
    const banner = await screen.findByRole('banner');
    const button = await within(banner).findByRole('button', { name: 'Preklopi skupino' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(button);

    const menu = await screen.findByRole('menu', { name: 'Preklopi skupino' });
    expect(within(menu).getAllByRole('group')).toHaveLength(3);
    expect(within(menu).getByRole('group', { name: 'Lastnik' })).toBeInTheDocument();
    expect(within(menu).getByRole('group', { name: 'Admin' })).toBeInTheDocument();
    const viewers = within(menu).getByRole('group', { name: 'Bralec' });
    expect(within(menu).queryByRole('group', { name: 'Urednik' })).not.toBeInTheDocument();
    expect(within(viewers).getAllByRole('menuitem', { name: /^Skupina \d{3}$/ })).toHaveLength(10);
    expect(within(menu).getAllByRole('menuitem', { name: 'Vse skupine' })).toHaveLength(1);
  });

  it('FR-002-06: izbira skupine jo odpre; trenutna skupina je označena', async () => {
    const { user } = renderGroupsApp(`/groups/${groupId(1)}/settings`, {
      list: listReply(BY_ROLE),
      get: detail,
    });
    await screen.findByRole('heading', { level: 1, name: 'Alfa' });

    await user.click(screen.getByRole('button', { name: 'Preklopi skupino' }));
    const menu = await screen.findByRole('menu', { name: 'Preklopi skupino' });
    expect(within(menu).getByRole('menuitem', { name: 'Alfa' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(within(menu).getByRole('menuitem', { name: 'Cvet' }));

    await waitFor(() => expect(currentLocation()).toBe(`/groups/${groupId(3)}/contacts`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Cvet' })).toBeInTheDocument();
  });

  it('FR-002-06: puščice premikajo fokus, Esc zapre meni in vrne fokus na gumb', async () => {
    const { user } = renderGroupsApp('/', { list: listReply(BY_ROLE), get: detail });
    const button = await screen.findByRole('button', { name: 'Preklopi skupino' });

    button.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: 'Preklopi skupino' });
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Alfa' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Beta' })).toHaveFocus();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('FR-002-06: pri širokem zaslonu gumba ni', async () => {
    setViewport('wide');
    renderGroupsApp('/', { list: listReply(BY_ROLE) });

    await screen.findByRole('navigation', { name: 'Moje skupine' });
    expect(screen.queryByRole('button', { name: 'Preklopi skupino' })).not.toBeInTheDocument();
  });

  it.each(['sl', 'en'] as const)(
    'FR-002-06: zaprt in odprt meni nimata kršitev axe (%s)',
    async (language) => {
      await i18n.changeLanguage(language);
      const { user, baseElement } = renderGroupsApp('/', { list: listReply(BY_ROLE) });
      const name = language === 'sl' ? 'Preklopi skupino' : 'Switch group';
      const button = await screen.findByRole('button', { name });
      expect((await axe(baseElement)).violations).toEqual([]);

      await user.click(button);
      await screen.findByRole('menu', { name });

      expect((await axe(baseElement)).violations).toEqual([]);
    },
  );
});
