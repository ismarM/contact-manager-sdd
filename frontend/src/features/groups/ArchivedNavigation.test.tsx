import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { listReply, renderGroupsApp, summaries } from '../../test/groupsApi';
import { resetViewport, setViewport } from '../../test/viewport';

// Povezave na *Arhivirane skupine* (FR-003-02, FR-003-07; plan.md – Key elements): zaslon *Skupine*, stranski pas in
// meni preklopa.

describe('povezave na Arhivirane skupine', () => {
  beforeEach(async () => {
    resetViewport();
    await i18n.changeLanguage('sl');
  });

  it('FR-003-07: zaslon Skupine ima povezavo, tudi ko je seznam prazen', async () => {
    renderGroupsApp('/');

    const main = await screen.findByRole('main');
    expect(await within(main).findByRole('link', { name: 'Arhivirane skupine' })).toHaveAttribute(
      'href',
      '/groups/archived',
    );
    expect(
      await within(main).findByRole('heading', { level: 2, name: 'Nimaš še nobene skupine.' }),
    ).toBeInTheDocument();
  });

  it('FR-003-02: zaslon s skupinami ima povezavo; stranski pas jo prikaže pri ≥ 1024 px', async () => {
    setViewport('wide');
    const { user } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(2) }) });

    const sidebar = await screen.findByRole('navigation', { name: 'Moje skupine' });
    const link = await within(sidebar).findByRole('link', { name: 'Arhivirane skupine' });
    expect(link).toHaveAttribute('href', '/groups/archived');
    expect(
      within(await screen.findByRole('main')).getByRole('link', { name: 'Arhivirane skupine' }),
    ).toBeInTheDocument();

    await user.click(link);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Arhivirane skupine' }),
    ).toBeInTheDocument();
  });

  it('FR-003-07: meni Preklopi skupino pri < 1024 px vsebuje Arhivirane skupine', async () => {
    setViewport('narrow');
    const { user } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(2) }) });

    await user.click(await screen.findByRole('button', { name: 'Preklopi skupino' }));
    const menu = await screen.findByRole('menu', { name: 'Preklopi skupino' });
    const item = within(menu).getByRole('menuitem', { name: 'Arhivirane skupine' });
    await user.click(item);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Arhivirane skupine' }),
    ).toBeInTheDocument();
  });

  it.each(['sl', 'en'])('FR-003-07: brez kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    setViewport('wide');
    const { container } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(2) }) });

    await screen.findAllByRole('link', {
      name: language === 'sl' ? 'Arhivirane skupine' : 'Archived groups',
    });
    expect((await axe(container)).violations).toEqual([]);
  });
});
