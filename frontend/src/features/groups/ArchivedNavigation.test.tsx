import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { listReply, renderGroupsApp, summaries } from '../../test/groupsApi';
import { navNames } from '../../test/names';
import { resetViewport, setViewport } from '../../test/viewport';

// Povezave na *Arhivirane skupine* (FR-003-02, FR-003-07; plan.md – Key elements): zaslon *Skupine*, stranski pas in
// meni preklopa.

describe('povezave na Arhivirane skupine', () => {
  beforeEach(async () => {
    resetViewport();
    await i18n.changeLanguage('sl');
  });

  it('FR-020-13: zaslon Skupine nima povezave na Arhivirane (stanje je izbira navigacije), tudi ko je seznam prazen', async () => {
    renderGroupsApp('/');

    const main = await screen.findByRole('main');
    expect(
      within(main).queryByRole('link', { name: 'Arhivirane skupine' }),
    ).not.toBeInTheDocument();
    expect(
      await within(main).findByRole('heading', { level: 2, name: 'Nimaš še nobene skupine.' }),
    ).toBeInTheDocument();
  });

  it('FR-003-02: zaslon s skupinami ima povezavo; stranski pas jo prikaže pri ≥ 1024 px', async () => {
    setViewport('wide');
    const { user } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(2) }) });

    const sidebar = await screen.findByRole('navigation', { name: 'Glavna navigacija' });
    const link = await within(sidebar).findByRole('link', { name: navNames.archived() });
    expect(link).toHaveAttribute('href', '/groups/archived');

    await user.click(link);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Arhivirane skupine' }),
    ).toBeInTheDocument();
  });

  it('FR-003-07: pod 640 px je Arhivirane postavka spodnje vrstice', async () => {
    setViewport('narrow');
    const { user } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(2) }) });

    const bar = await screen.findByRole('navigation', { name: 'Glavna navigacija' });
    await user.click(within(bar).getByRole('link', { name: navNames.archived() }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Arhivirane skupine' }),
    ).toBeInTheDocument();
  });

  it.each(['sl', 'en'])('FR-003-07: brez kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    setViewport('wide');
    const { container } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(2) }) });

    await screen.findByRole('link', { name: navNames.archived() });
    await screen.findAllByRole('link', { name: 'Skupina 001' });
    expect((await axe(container)).violations).toEqual([]);
  });
});
