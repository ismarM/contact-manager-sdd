import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { renderAccountApp } from '../../test/myDataApi';
import { ANA_PROFILE, currentLocation, mockProfileApi, renderApp } from '../../test/renderApp';

function renderAccount(options: Parameters<typeof mockProfileApi>[0] = {}) {
  const api = mockProfileApi(options);
  const gateway = createAuthFake({ user: ANA });
  const view = renderApp('/account', { gateway });
  return { ...view, api, gateway };
}

const preferenceRequests = (api: ReturnType<typeof mockProfileApi>) =>
  api.requests.filter((r) => r.path === '/api/me/preferences');

describe('AccountPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-001-14: Profil prikaže ime in e-naslov samo za branje', async () => {
    renderAccount();

    expect(await screen.findByRole('heading', { level: 1, name: 'Moj račun' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Profil' })).toBeInTheDocument();
    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    const values = screen.getAllByRole('definition').map((value) => value.textContent);
    expect(terms).toEqual(['Ime', 'E-naslov']);
    expect(values).toEqual(['Ana Novak', 'ana@primer.si']);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('FR-001-14: račun brez imena prikaže e-naslov kot ime', async () => {
    renderAccount({ profile: { ...ANA_PROFILE, name: null } });

    await screen.findByRole('heading', { level: 2, name: 'Profil' });
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      'ana@primer.si',
      'ana@primer.si',
    ]);
  });

  it('FR-001-15: izbira English takoj prevede vmesnik in se shrani na napravi in v profil', async () => {
    const { user, api } = renderAccount();
    const languages = await screen.findByRole('group', { name: 'Jezik' });
    expect(within(languages).getByRole('radio', { name: 'Slovenščina' })).toBeChecked();

    await user.click(within(languages).getByRole('radio', { name: 'English' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'My account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('My account – Contacts');
    expect(localStorage.getItem('language')).toBe('en');
    await waitFor(() => expect(preferenceRequests(api)).toHaveLength(1));
    expect(preferenceRequests(api)[0]?.body).toEqual({ language: 'en', theme: null });
    expect(preferenceRequests(api)[0]?.authorization).toBe('Bearer token-uid-ana');
  });

  it('FR-001-17: Temna in Svetla takoj zamenjata shemo, Sistemska (privzeta) izbiro izbriše', async () => {
    const { user, api } = renderAccount();
    const theme = await screen.findByRole('group', { name: 'Tema' });
    expect(within(theme).getByRole('radio', { name: 'Sistemska' })).toBeChecked();

    await user.click(within(theme).getByRole('radio', { name: 'Temna' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(within(theme).getByRole('radio', { name: 'Svetla' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');

    await user.click(within(theme).getByRole('radio', { name: 'Sistemska' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBeNull();

    await waitFor(() => expect(preferenceRequests(api)).toHaveLength(3));
    expect(preferenceRequests(api).map((r) => r.body)).toEqual([
      { language: 'sl', theme: 'dark' },
      { language: 'sl', theme: 'light' },
      { language: 'sl', theme: null },
    ]);
  });

  it.each([
    ['napaka zaledja', 503],
    ['brez povezave', 'network-error'],
  ] as const)(
    'FR-001-19: neuspelo shranjevanje v račun (%s) pusti izbiro na napravi, pokaže sporočilo in ne ponovi zahtevka',
    async (_label, preferencesStatus) => {
      const { user, api, gateway } = renderAccount({ preferencesStatus });
      const theme = await screen.findByRole('group', { name: 'Tema' });

      await user.click(within(theme).getByRole('radio', { name: 'Temna' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Izbire ni bilo mogoče shraniti v račun.',
      );
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(within(theme).getByRole('radio', { name: 'Temna' })).toBeChecked();
      // Uporabnik ostane prijavljen na isti strani; samodejnega ponovnega poskusa ni.
      expect(currentLocation()).toBe('/account');
      expect(gateway.signOutCalls).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(preferenceRequests(api)).toHaveLength(1);
      expect(api.profile.theme).toBeNull();
    },
  );

  it('FR-001-09: gumb Odjava na strani Moj račun odjavi uporabnika', async () => {
    const { user, gateway } = renderAccount();

    await user.click(await screen.findByRole('button', { name: 'Odjava' }));

    await waitFor(() => expect(currentLocation()).toBe('/login'));
    expect(gateway.signOutCalls).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-001-18: naslov strani je »Moj račun – Kontakti«', async () => {
    renderAccount();

    await screen.findByRole('heading', { level: 1, name: 'Moj račun' });
    expect(document.title).toBe('Moj račun – Kontakti');
  });

  it.each(['light', 'dark'] as const)(
    'FR-001-14: Moj račun nima kršitev axe (tema %s)',
    async (theme) => {
      localStorage.setItem('theme', theme);
      document.documentElement.dataset.theme = theme;
      const { container } = renderAccount();
      await screen.findByRole('group', { name: 'Tema' });

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});

describe('AccountPage – Moji podatki in Izbris računa', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-012-01 FR-012-05: razdelki si sledijo Profil → Videz → Moji podatki → Izbris računa → Odjava', async () => {
    renderAccountApp();

    await screen.findByRole('heading', { level: 1, name: 'Moj račun' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Profil',
      'Videz',
      'Moji podatki',
      'Izbris računa',
    ]);
    const regions = [
      screen.getByRole('heading', { level: 2, name: 'Moji podatki' }),
      screen.getByRole('heading', { level: 2, name: 'Izbris računa' }),
      screen.getByRole('button', { name: 'Odjava' }),
    ];
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      follows(screen.getByRole('heading', { level: 2, name: 'Videz' }), regions[0] as Element),
    ).toBe(true);
    expect(follows(regions[0] as Element, regions[1] as Element)).toBe(true);
    expect(follows(regions[1] as Element, regions[2] as Element)).toBe(true);
  });

  it('FR-012-01 FR-012-05: obstoječi razdelki delujejo ob novih (profil in videz še vedno prikazana)', async () => {
    const { user, profile } = renderAccountApp();

    const theme = await screen.findByRole('group', { name: 'Tema' });
    await user.click(within(theme).getByRole('radio', { name: 'Temna' }));

    await waitFor(() =>
      expect(profile.requests.filter((r) => r.path === '/api/me/preferences')).toHaveLength(1),
    );
    expect(screen.getByRole('region', { name: 'Profil' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Moji podatki' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Izbris računa' })).toBeInTheDocument();
  });

  it('FR-012-01: stran Moj račun z novima razdelkoma nima kršitev axe', async () => {
    const { container } = renderAccountApp();
    await screen.findByRole('region', { name: 'Izbris računa' });
    await within(await screen.findByRole('region', { name: 'Izbris računa' })).findByRole(
      'button',
      {
        name: 'Izbriši račun',
      },
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
