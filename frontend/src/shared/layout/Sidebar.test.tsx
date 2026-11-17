import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  archivedReply,
  archivedSummary,
  groupDetail,
  groupId,
  listReply,
  renderGroupsApp,
  summaries,
  summary,
} from '../../test/groupsApi';
import { navNames, roleName, switcherNames } from '../../test/names';
import { server } from '../../test/msw';
import { currentLocation } from '../../test/renderApp';
import { setViewport } from '../../test/viewport';

// Stranska vrstica pri širini ≥ 1024 px (FR-020-05, -06, -09; design.md 7.1) in kartica *Trenutna skupina*.

const BY_ROLE = {
  OWNER: [summary(1, { title: 'Alfa' }), summary(2, { title: 'Beta' })],
  ADMIN: [summary(3, { title: 'Cvet' })],
  VIEWER: summaries(14, 100),
};

const detail = (id: string) => {
  const found = [...BY_ROLE.OWNER, ...BY_ROLE.ADMIN, ...BY_ROLE.VIEWER].find((g) => g.id === id);
  return found
    ? {
        status: 200,
        body: groupDetail({ id, title: found.title, role: id === groupId(3) ? 'ADMIN' : 'OWNER' }),
      }
    : { status: 404 };
};

const invitationCount = (count: number) =>
  server.use(http.get('/api/invitations/count', () => HttpResponse.json({ count })));

const mainNav = () => screen.findByRole('navigation', { name: 'Glavna navigacija' });

describe('Sidebar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('wide');
  });

  it('FR-020-05: besedna znamka, Skupine in Arhivirane s števci, Povabila kot značka z novimi povabili', async () => {
    invitationCount(3);
    renderGroupsApp('/', {
      list: listReply(BY_ROLE),
      listArchived: archivedReply([archivedSummary(1), archivedSummary(2)]),
    });

    const nav = await mainNav();
    const groups = await within(nav).findByRole('link', { name: navNames.groups() });
    await waitFor(() => expect(groups).toHaveAccessibleDescription('17'));
    expect(groups).toHaveAttribute('aria-current', 'page');
    const archived = within(nav).getByRole('link', { name: navNames.archived() });
    await waitFor(() => expect(archived).toHaveAccessibleDescription('2'));
    const invitations = await within(nav).findByRole('link', { name: navNames.invitationsNew(3) });
    expect(invitations).toHaveAttribute('href', '/invitations');
    expect(invitations).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: 'Kontakti' })).toHaveAttribute('href', '/');
  });

  it('FR-020-05: v navigaciji ni seznama skupin, gumba Nova skupina ne stikala teme', async () => {
    renderGroupsApp('/', { list: listReply(BY_ROLE) });

    // Spremenjeno (020, US3): zaslon Skupine ima zbirko kartic in gumb Nova skupina, zato se preverja samo navigacija.
    const nav = await mainNav();
    expect(within(nav).queryByRole('link', { name: 'Alfa' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Nova skupina' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tema/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('FR-020-05: ob napaki posamezen števec izpade, drugi ostanejo', async () => {
    invitationCount(2);
    renderGroupsApp('/', {
      list: listReply(BY_ROLE),
      listArchived: () => ({ status: 500, body: { code: 'INTERNAL' } }),
    });

    const nav = await mainNav();
    const groups = within(nav).getByRole('link', { name: navNames.groups() });
    await waitFor(() => expect(groups).toHaveAccessibleDescription('17'));
    expect(
      within(nav).getByRole('link', { name: navNames.archived() }),
    ).toHaveAccessibleDescription('');
    expect(
      await within(nav).findByRole('link', { name: navNames.invitationsNew(2) }),
    ).toBeVisible();
  });

  it('FR-020-05: postavka računa na dnu odpre meni računa (Moj račun, jezik, Odjava)', async () => {
    const { user } = renderGroupsApp('/', { list: listReply(BY_ROLE) });

    await user.click(await screen.findByRole('button', { name: 'Meni računa' }));

    const menu = await screen.findByRole('menu', { name: 'Meni računa' });
    expect(within(menu).getByRole('menuitem', { name: 'Moj račun' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Odjava' })).toBeInTheDocument();
  });

  it('FR-020-05: aktivna je postavka trenutne strani (Arhivirane, Povabila)', async () => {
    renderGroupsApp('/groups/archived', { list: listReply(BY_ROLE) });
    const nav = await mainNav();

    expect(within(nav).getByRole('link', { name: navNames.archived() })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: navNames.groups() })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('FR-020-05: zunaj skupine kartice Trenutna skupina ni', async () => {
    renderGroupsApp('/', { list: listReply(BY_ROLE), get: detail });
    await mainNav();

    expect(screen.queryByRole('button', { name: switcherNames.button() })).not.toBeInTheDocument();
  });

  it('FR-020-05: kartica Trenutna skupina v skupini – naziv, vloga, preklopnik', async () => {
    renderGroupsApp(`/groups/${groupId(3)}/settings`, { list: listReply(BY_ROLE), get: detail });

    const card = await screen.findByRole('button', { name: switcherNames.button() });
    expect(card).toHaveAccessibleDescription('Cvet');
    // Vidno besedilo je ob gumbu, ki prekrije kartico (ime gumba = »Preklopi skupino«, WCAG 2.5.3).
    const visible = card.parentElement;
    expect(visible).toHaveTextContent('Trenutna skupina');
    expect(visible).toHaveTextContent('Cvet');
    expect(visible).toHaveTextContent(roleName('ADMIN'));
  });

  it('FR-020-06: izbira skupine v kartici ohrani zavihek (Revizijska sled), označena je trenutna', async () => {
    const { user } = renderGroupsApp(`/groups/${groupId(1)}/audit`, {
      list: listReply(BY_ROLE),
      get: detail,
    });
    await user.click(await screen.findByRole('button', { name: switcherNames.button() }));

    const menu = await screen.findByRole('menu', { name: switcherNames.menu() });
    expect(within(menu).getByRole('menuitem', { name: 'Alfa' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menu).queryByRole('group')).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Cvet' }));

    await waitFor(() => expect(currentLocation()).toBe(`/groups/${groupId(3)}/audit`));
  });

  it('FR-020-06: zavihek, ki ga bralec nima (Dvojniki), preklopi na Kontakte', async () => {
    const { user } = renderGroupsApp(`/groups/${groupId(3)}/duplicates`, {
      list: listReply(BY_ROLE),
      get: detail,
    });
    await user.click(await screen.findByRole('button', { name: switcherNames.button() }));
    const menu = await screen.findByRole('menu', { name: switcherNames.menu() });

    await user.click(within(menu).getByRole('menuitem', { name: 'Skupina 100' }));

    await waitFor(() => expect(currentLocation()).toBe(`/groups/${groupId(100)}/contacts`));
  });

  it('FR-020-06: odstranjena skupina po preklopu prikaže »Te strani ni«', async () => {
    const { user } = renderGroupsApp(`/groups/${groupId(1)}/contacts`, {
      list: listReply(BY_ROLE),
      get: (id) => (id === groupId(3) ? { status: 404 } : detail(id)),
    });
    await user.click(await screen.findByRole('button', { name: switcherNames.button() }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cvet' }));

    expect(await screen.findByRole('heading', { name: 'Te strani ni' })).toBeInTheDocument();
  });

  it('FR-020-06: pri več kot 100 skupinah je v preklopniku 100 skupin in »Vse skupine«', async () => {
    const { user } = renderGroupsApp(`/groups/${groupId(1)}/contacts`, {
      list: listReply({ OWNER: summaries(101) }),
      get: detail,
    });
    await user.click(await screen.findByRole('button', { name: switcherNames.button() }));

    const menu = await screen.findByRole('menu', { name: switcherNames.menu() });
    await within(menu).findByRole('menuitem', { name: 'Skupina 001' });
    expect(within(menu).getAllByRole('menuitem', { name: /^Skupina \d{3}$/ })).toHaveLength(100);
    expect(within(menu).getByRole('menuitem', { name: switcherNames.allGroups() })).toBeVisible();
  });

  it('FR-020-06: puščice premikajo fokus, Esc zapre meni in vrne fokus na kartico', async () => {
    const { user } = renderGroupsApp(`/groups/${groupId(1)}/contacts`, {
      list: listReply(BY_ROLE),
      get: detail,
    });
    const card = await screen.findByRole('button', { name: switcherNames.button() });

    card.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: switcherNames.menu() });
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Alfa' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Beta' })).toHaveFocus();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(card).toHaveFocus();
  });

  it.each(['sl', 'en'] as const)(
    'FR-020-05: stranska vrstica in odprt preklopnik nimata kršitev axe (%s)',
    async (language) => {
      await i18n.changeLanguage(language);
      const { user, container } = renderGroupsApp(`/groups/${groupId(1)}/contacts`, {
        list: listReply(BY_ROLE),
        get: detail,
      });
      const card = await screen.findByRole('button', { name: switcherNames.button() });
      expect((await axe(container)).violations).toEqual([]);

      await user.click(card);
      await screen.findByRole('menu', { name: switcherNames.menu() });

      expect((await axe(document.body)).violations).toEqual([]);
    },
  );
});
