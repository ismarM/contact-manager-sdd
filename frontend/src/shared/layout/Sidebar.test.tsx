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
import { setViewport } from '../../test/viewport';

// Stranski pas pri širini ≥ 1024 px (FR-002-06, FR-002-01; design.md 7.1, research R-10; plan.md – Key elements).

const BY_ROLE = {
  OWNER: [summary(1, { title: 'Alfa' }), summary(2, { title: 'Beta' })],
  ADMIN: [summary(3, { title: 'Cvet' })],
  VIEWER: summaries(14, 100),
};

describe('Sidebar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('wide');
  });

  it('FR-020-06: en seznam mojih skupin (brez razdelkov po vlogah) in brez »Vse skupine«, kadar so vse prikazane', async () => {
    const { listRequests } = renderGroupsApp('/', { list: listReply(BY_ROLE) });

    const sidebar = await screen.findByRole('navigation', { name: 'Moje skupine' });
    await within(sidebar).findByRole('link', { name: 'Alfa' });
    expect(within(sidebar).queryAllByRole('heading')).toHaveLength(0);
    expect(within(sidebar).getAllByRole('link', { name: /^Skupina \d{3}$/ })).toHaveLength(14);
    expect(within(sidebar).queryByRole('link', { name: 'Vse skupine' })).not.toBeInTheDocument();
    expect(listRequests(100)[0]?.search.get('lang')).toBe('sl');
  });

  it('FR-020-06: pri več kot 100 skupinah je prikazanih 100 in »Vse skupine« vodi na /', async () => {
    renderGroupsApp('/', { list: listReply({ OWNER: summaries(101) }) });

    const sidebar = await screen.findByRole('navigation', { name: 'Moje skupine' });
    await within(sidebar).findByRole('link', { name: 'Skupina 001' });
    expect(within(sidebar).getAllByRole('link', { name: /^Skupina \d{3}$/ })).toHaveLength(100);
    expect(within(sidebar).getByRole('link', { name: 'Vse skupine' })).toHaveAttribute('href', '/');
  });

  it('FR-002-06: stranski pas je prisoten tudi na Mojem računu', async () => {
    renderGroupsApp('/account', { list: listReply(BY_ROLE) });

    const sidebar = await screen.findByRole('navigation', { name: 'Moje skupine' });
    expect(await within(sidebar).findByRole('link', { name: 'Alfa' })).toBeInTheDocument();
  });

  it('FR-002-06: odprta skupina je označena kot trenutna stran', async () => {
    const id = groupId(3);
    renderGroupsApp(`/groups/${id}/settings`, {
      list: listReply(BY_ROLE),
      get: () => ({ status: 200, body: groupDetail({ id, title: 'Cvet', role: 'ADMIN' }) }),
    });

    const sidebar = await screen.findByRole('navigation', { name: 'Moje skupine' });
    const current = await within(sidebar).findByRole('link', { name: 'Cvet' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: 'Alfa' })).not.toHaveAttribute('aria-current');
  });

  it('FR-002-01: Nova skupina v stranskem pasu odpre dialog; po ustvarjanju se povzetek ponovno naloži', async () => {
    const { user, listRequests } = renderGroupsApp('/account', {
      list: listReply(BY_ROLE),
      get: (id) => ({ status: 200, body: groupDetail({ id, title: 'Nova', role: 'OWNER' }) }),
    });
    const sidebar = await screen.findByRole('navigation', { name: 'Moje skupine' });
    await within(sidebar).findByRole('link', { name: 'Alfa' });
    const before = listRequests(100).length;

    await user.click(within(sidebar).getByRole('button', { name: 'Nova skupina' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova skupina' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Naslov' }), 'Nova');
    await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));

    await waitFor(() => expect(listRequests(100).length).toBeGreaterThan(before));
  });

  it('FR-002-06: pri ozkem zaslonu stranskega pasu ni', async () => {
    setViewport('narrow');
    renderGroupsApp('/', { list: listReply(BY_ROLE) });

    await screen.findByRole('button', { name: 'Preklopi skupino' });
    expect(screen.queryByRole('navigation', { name: 'Moje skupine' })).not.toBeInTheDocument();
  });

  it('FR-002-06: preklop širine med uporabo zamenja stranski pas in gumb za preklop', async () => {
    renderGroupsApp('/', { list: listReply(BY_ROLE) });
    await screen.findByRole('navigation', { name: 'Moje skupine' });

    setViewport('narrow');

    expect(await screen.findByRole('button', { name: 'Preklopi skupino' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Moje skupine' })).not.toBeInTheDocument();
  });

  it.each(['sl', 'en'] as const)(
    'FR-002-06: stranski pas nima kršitev axe (%s)',
    async (language) => {
      await i18n.changeLanguage(language);
      const { container } = renderGroupsApp('/', { list: listReply(BY_ROLE) });
      const name = language === 'sl' ? 'Moje skupine' : 'My groups';
      const sidebar = await screen.findByRole('navigation', { name });
      await within(sidebar).findByRole('link', { name: 'Alfa' });
      if (language === 'en') {
        expect(within(sidebar).getByRole('link', { name: 'Alfa' })).toBeInTheDocument();
      }

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
