import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  archivedReply,
  archivedSummary,
  listReply,
  renderGroupsApp,
  summary,
} from '../../test/groupsApi';
import { currentLocation } from '../../test/renderApp';
import type { GroupItem, Role } from './types';

// Iskanje in filtri na zaslonu *Skupine* (FR-017-14 … -18; plan.md – Pages and routes; design.md 9.2).

const BY_ROLE: Partial<Record<Role, GroupItem[]>> = {
  OWNER: [summary(1, { title: 'Alfa' }), summary(2, { title: 'Šolski krožek' })],
  ADMIN: [summary(3, { title: 'Alfa klub' })],
  VIEWER: [summary(4, { title: 'Delta' })],
};

/** Strežnik z iskanjem po pogodbi: `q` brez razlike velikosti črk (preprosto, za test vmesnika). */
function list(url: URL) {
  const q = (url.searchParams.get('q') ?? '').toLowerCase();
  const filtered = Object.fromEntries(
    Object.entries(BY_ROLE).map(([role, items]) => [
      role,
      (items ?? []).filter((item) => item.title.toLowerCase().includes(q)),
    ]),
  );
  return listReply(filtered)(url);
}

const searchBox = () => screen.findByRole('searchbox', { name: 'Išči skupine' });

describe('Iskanje skupin', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-017-14 FR-017-18: vnos pošlje q po zakasnitvi, prikaže samo zadetke, objavi število in zapiše q v URL', async () => {
    const { api, user } = renderGroupsApp('/', { list });
    await screen.findByRole('link', { name: 'Alfa' });

    await user.type(await searchBox(), 'alf');

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Delta' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('link', { name: 'Alfa klub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alfa' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 zadetka');
    expect(currentLocation()).toBe('/?q=alf');
    const last = api.of('GET', '/api/groups').at(-1);
    expect(last?.search.get('q')).toBe('alf');
    // Zakasnitev: ena poizvedba za celoten vnos, ne za vsako črko.
    expect(api.of('GET', '/api/groups').filter((r) => r.search.get('q'))).toHaveLength(1);
  });

  it('FR-017-15: filter vlog (več hkrati) pokaže samo izbrane razdelke in zapiše role v URL', async () => {
    const { user } = renderGroupsApp('/', { list });
    await screen.findByRole('link', { name: 'Alfa' });
    const filter = screen.getByRole('group', { name: 'Vloga' });

    await user.click(within(filter).getByRole('checkbox', { name: 'Bralec' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Alfa' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Delta' })).toBeInTheDocument();
    await user.click(within(filter).getByRole('checkbox', { name: 'Lastnik' }));

    expect(await screen.findByRole('link', { name: 'Alfa' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Delta' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Alfa klub' })).not.toBeInTheDocument();
    expect(currentLocation()).toBe('/?role=OWNER&role=VIEWER');
  });

  it('FR-017-16: Stanje Arhivirane pokaže arhivirane skupine z istim iskanjem in filtrom vlog', async () => {
    const { api, user } = renderGroupsApp('/?q=arh&role=ADMIN', {
      list,
      listArchived: (url) =>
        archivedReply([archivedSummary(7, { title: 'Arhiv sedem', role: 'ADMIN' })])(url),
    });
    await user.click(await screen.findByRole('radio', { name: 'Arhivirane' }));

    expect(await screen.findByRole('link', { name: 'Arhiv sedem' })).toBeInTheDocument();
    const request = api.of('GET', '/api/groups/archived').at(-1);
    expect(request?.search.get('q')).toBe('arh');
    expect(request?.search.getAll('role')).toEqual(['ADMIN']);
    expect(currentLocation()).toBe('/?q=arh&role=ADMIN&state=archived');
    expect(await screen.findByRole('status')).toHaveTextContent('1 zadetek');
    expect(screen.getByRole('link', { name: 'Arhivirane skupine' })).toBeInTheDocument();
  });

  it('FR-017-17: stanje iz URL napolni polja; brez zadetkov je prazno stanje, Počisti iskanje ga ponastavi', async () => {
    const { user } = renderGroupsApp('/?q=nicneobstaja&role=VIEWER', { list });

    expect(await searchBox()).toHaveValue('nicneobstaja');
    expect(screen.getByRole('checkbox', { name: 'Bralec' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Aktivne' })).toBeChecked();
    expect(await screen.findByRole('heading', { level: 2, name: 'Ni zadetkov.' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Počisti iskanje' }));

    expect(await screen.findByRole('link', { name: 'Alfa' })).toBeVisible();
    expect(await searchBox()).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Bralec' })).not.toBeChecked();
    expect(currentLocation()).toBe('/');
  });

  it('FR-017-18: menjava iskanja pošlje zahtevek brez page (prva stran)', async () => {
    const { api, user } = renderGroupsApp('/', { list });
    await screen.findByRole('link', { name: 'Alfa' });

    await user.type(await searchBox(), 'delta');

    await screen.findByRole('link', { name: 'Delta' });
    expect(api.of('GET', '/api/groups').at(-1)?.search.get('page')).toBeNull();
  });

  it.each(['sl', 'en'] as const)('FR-017-14: obrazec je dostopen (axe) – %s', async (language) => {
    await i18n.changeLanguage(language);
    renderGroupsApp('/?q=alf', { list });

    const box = await screen.findByRole('searchbox', {
      name: language === 'sl' ? 'Išči skupine' : 'Search groups',
    });
    const region = box.closest('[role="search"]') as HTMLElement;
    await screen.findByRole('status');

    expect((await axe(region)).violations).toEqual([]);
  });
});
