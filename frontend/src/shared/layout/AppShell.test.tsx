import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { ANA_PROFILE, currentLocation, mockProfileApi, renderApp } from '../../test/renderApp';

function renderSignedIn(path = '/', options: Parameters<typeof mockProfileApi>[0] = {}) {
  const api = mockProfileApi(options);
  const view = renderApp(path, { gateway: createAuthFake({ user: ANA }) });
  return { ...view, api };
}

describe('AppShell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-001-11: prvi Tab fokusira »Preskoči na vsebino«, ki premakne fokus na glavno vsebino', async () => {
    const { user } = renderSignedIn();
    await screen.findByRole('button', { name: 'Meni računa' });

    await user.tab();

    const skip = screen.getByRole('link', { name: 'Preskoči na vsebino' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('FR-001-11: zgornja vrstica z besednim znakom in menijem računa z začetnicami', async () => {
    renderSignedIn();

    const banner = await screen.findByRole('banner');
    expect(within(banner).getByRole('link', { name: 'Kontakti' })).toHaveAttribute('href', '/');
    const menuButton = within(banner).getByRole('button', { name: 'Meni računa' });
    expect(menuButton).toHaveTextContent('AN');
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('FR-001-11: račun brez imena ima za začetnico prvo črko e-naslova', async () => {
    mockProfileApi({ profile: { ...ANA_PROFILE, name: null, email: 'bojan@primer.si' } });
    renderApp('/', {
      gateway: createAuthFake({
        user: { uid: 'uid-bojan', email: 'bojan@primer.si', displayName: null },
      }),
    });

    expect(await screen.findByRole('button', { name: 'Meni računa' })).toHaveTextContent(/^B$/);
  });

  it('FR-001-12: meni računa vsebuje Moj račun, izbiro jezika in Odjavo', async () => {
    const { user } = renderSignedIn();

    await user.click(await screen.findByRole('button', { name: 'Meni računa' }));

    const menu = await screen.findByRole('menu', { name: 'Meni računa' });
    expect(within(menu).getByRole('menuitem', { name: 'Moj račun' })).toBeInTheDocument();
    const languages = within(menu).getByRole('group', { name: 'Jezik' });
    expect(within(languages).getByRole('menuitemradio', { name: 'Slovenščina' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(languages).getByRole('menuitemradio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Odjava' })).toBeInTheDocument();
  });

  it('FR-001-12: meni deluje s tipkovnico – puščice premikajo fokus, Esc zapre in vrne fokus', async () => {
    const { user } = renderSignedIn();
    const button = await screen.findByRole('button', { name: 'Meni računa' });
    button.focus();

    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: 'Meni računa' });
    await waitFor(() =>
      expect(within(menu).getByRole('menuitem', { name: 'Moj račun' })).toHaveFocus(),
    );

    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'Slovenščina' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'English' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Odjava' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');
    expect(within(menu).getByRole('menuitem', { name: 'Moj račun' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('FR-001-12: klik drugam zapre meni in vrne fokus na gumb', async () => {
    const { user } = renderSignedIn();
    const button = await screen.findByRole('button', { name: 'Meni računa' });

    await user.click(button);
    await screen.findByRole('menu', { name: 'Meni računa' });
    await user.click(screen.getByRole('main'));

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('FR-001-12: »Moj račun« v meniju odpre stran Moj račun', async () => {
    const { user } = renderSignedIn();

    await user.click(await screen.findByRole('button', { name: 'Meni računa' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Moj račun' }));

    await waitFor(() => expect(currentLocation()).toBe('/account'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Moj račun' })).toBeInTheDocument();
  });

  it('FR-001-12: izbira jezika v meniju zamenja jezik enako kot v Mojem računu', async () => {
    const { user, api } = renderSignedIn();

    await user.click(await screen.findByRole('button', { name: 'Meni računa' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'English' }));

    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('language')).toBe('en');
    await waitFor(() =>
      expect(api.requests.filter((r) => r.path === '/api/me/preferences')).toHaveLength(1),
    );
    expect(api.requests.find((r) => r.path === '/api/me/preferences')?.body).toEqual({
      language: 'en',
      theme: null,
    });
  });

  it.each([
    ['napaka zaledja', 500],
    ['brez povezave', 'network-error'],
  ] as const)(
    'FR-001-19: neuspelo shranjevanje izbire (%s) pokaže sporočilo pod zgornjo vrstico, izbira ostane',
    async (_label, preferencesStatus) => {
      const { user, api } = renderSignedIn('/', { preferencesStatus });

      await user.click(await screen.findByRole('button', { name: 'Meni računa' }));
      await user.click(await screen.findByRole('menuitemradio', { name: 'English' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Your choice could not be saved to your account.',
      );
      expect(document.documentElement.lang).toBe('en');
      expect(localStorage.getItem('language')).toBe('en');
      expect(currentLocation()).toBe('/');
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(api.requests.filter((r) => r.path === '/api/me/preferences')).toHaveLength(1);
      expect(api.profile.language).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Dismiss message' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('FR-001-11: ogrodje nima kršitev axe – zaprt in odprt meni', async () => {
    const { container, user } = renderSignedIn();
    await screen.findByRole('button', { name: 'Meni računa' });

    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Meni računa' }));
    await screen.findByRole('menu');
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
