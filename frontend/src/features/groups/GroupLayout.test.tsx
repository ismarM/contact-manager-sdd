import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail, renderGroupsApp, type Reply } from '../../test/groupsApi';
import { currentLocation } from '../../test/renderApp';

// Glava in navigacija skupine, »Te strani ni« za nečlana (FR-002-07, -08, -09; plan.md – Pages and routes,
// Key elements; design.md 7.1, 8.5, 9.10).

const asEditor = (overrides: Parameters<typeof groupDetail>[0] = {}): Reply => ({
  status: 200,
  body: groupDetail({ role: 'EDITOR', ...overrides }),
});

describe('GroupLayout', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-002-07: odprtje skupine prikaže privzeti razdelek (Kontakti)', async () => {
    renderGroupsApp(`/groups/${GROUP_ID}`, { get: () => asEditor() });

    await waitFor(() => expect(currentLocation()).toBe(`/groups/${GROUP_ID}/contacts`));
  });

  it('FR-002-07: glava z naslovom, vlogo (»Vloga: Urednik«) in navigacijo z Nastavitvami kot trenutno stranjo', async () => {
    renderGroupsApp(`/groups/${GROUP_ID}/settings`, { get: () => asEditor() });

    const header = await screen.findByRole('region', { name: 'Projekt FERI' });
    expect(
      within(header).getByRole('heading', { level: 1, name: 'Projekt FERI' }),
    ).toBeInTheDocument();
    expect(header).toHaveTextContent('Vloga: Urednik');
    expect(header).not.toHaveTextContent('Arhivirano');
    const sections = within(header).getByRole('navigation', { name: 'Razdelki skupine' });
    const settings = within(sections).getByRole('link', { name: 'Nastavitve' });
    expect(settings).toHaveAttribute('href', `/groups/${GROUP_ID}/settings`);
    expect(settings).toHaveAttribute('aria-current', 'page');
    // Povezave, ne ARIA zavihki (FR-002-07, design.md 7.1).
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('FR-002-07: arhivirana skupina ima v glavi oznako Arhivirano', async () => {
    renderGroupsApp(`/groups/${GROUP_ID}/settings`, {
      get: () => asEditor({ archived: true }),
    });

    const header = await screen.findByRole('region', { name: 'Projekt FERI' });
    expect(header).toHaveTextContent('Arhivirano');
  });

  it('FR-002-07: bralec vidi razdelek Nastavitve', async () => {
    renderGroupsApp(`/groups/${GROUP_ID}/settings`, {
      get: () => ({ status: 200, body: groupDetail({ role: 'VIEWER' }) }),
    });

    const header = await screen.findByRole('region', { name: 'Projekt FERI' });
    expect(header).toHaveTextContent('Vloga: Bralec');
    expect(
      within(within(header).getByRole('navigation', { name: 'Razdelki skupine' })).getByRole(
        'link',
        { name: 'Nastavitve' },
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['nečlan ali neobstoječa skupina', `/groups/${GROUP_ID}/settings`],
    ['brez razdelka', `/groups/${GROUP_ID}`],
  ])('FR-002-08: 404 (%s) prikaže »Te strani ni« brez podatkov skupine', async (_case, path) => {
    renderGroupsApp(path, { get: () => ({ status: 404 }) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Na seznam skupin' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Te strani ni – Kontakti');
    expect(screen.getByRole('main')).not.toHaveTextContent(/Projekt FERI/);
    expect(screen.queryByRole('region', { name: 'Projekt FERI' })).not.toBeInTheDocument();
  });

  it('FR-002-08: neznan podrazdelek skupine prikaže »Te strani ni«', async () => {
    renderGroupsApp(`/groups/${GROUP_ID}/neznano`, { get: () => asEditor() });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
  });

  it('FR-002-09: naslov strani je »Nastavitve – ‹skupina› – Kontakti« v jeziku vmesnika', async () => {
    renderGroupsApp(`/groups/${GROUP_ID}/settings`, { get: () => asEditor() });
    await screen.findByRole('heading', { level: 1, name: 'Projekt FERI' });

    await waitFor(() => expect(document.title).toBe('Nastavitve – Projekt FERI – Kontakti'));

    await i18n.changeLanguage('en');
    await waitFor(() => expect(document.title).toBe('Settings – Projekt FERI – Contacts'));
    const header = screen.getByRole('region', { name: 'Projekt FERI' });
    expect(header).toHaveTextContent('Role: Editor');
    expect(within(header).getByRole('navigation', { name: 'Group sections' })).toBeInTheDocument();
  });

  it('FR-002-07: dolg naslov (100 znakov) je v glavi v celoti', async () => {
    const title = 'D'.repeat(100);
    renderGroupsApp(`/groups/${GROUP_ID}/settings`, { get: () => asEditor({ title }) });

    expect(await screen.findByRole('heading', { level: 1, name: title })).toHaveTextContent(title);
  });

  it.each([
    ['sl', 'navadna'],
    ['en', 'navadna'],
    ['sl', 'arhivirana'],
    ['en', 'arhivirana'],
    ['sl', '404'],
    ['en', '404'],
  ] as const)(
    'FR-002-07 FR-002-08: okvir skupine nima kršitev axe (%s, %s)',
    async (language, state) => {
      await i18n.changeLanguage(language);
      const { container } = renderGroupsApp(`/groups/${GROUP_ID}/settings`, {
        get: () =>
          state === '404' ? { status: 404 } : asEditor({ archived: state === 'arhivirana' }),
      });
      if (state === '404') {
        await screen.findByRole('heading', {
          level: 1,
          name: language === 'sl' ? 'Te strani ni' : 'Page not found',
        });
      } else {
        await screen.findByRole('region', { name: 'Projekt FERI' });
      }

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
