import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { currentLocation, mockProfileApi, renderApp } from '../../test/renderApp';
import type { SignInErrorCode } from './AuthGateway';

describe('LoginPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-001-01: kartica z besednim znakom in edino kontrolo »Prijava z Googlom«, brez polj', async () => {
    renderApp('/login');

    expect(await screen.findByRole('button', { name: 'Prijava z Googlom' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByLabelText(/geslo|password/i)).not.toBeInTheDocument();
    // Edina možnost prijave: poleg nje sta le gumba za izbiro jezika pod kartico.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Prijava z Googlom',
      'Slovenščina',
      'English',
    ]);
  });

  it('FR-001-02: uspešna prijava sinhronizira profil in vodi na začetno stran', async () => {
    const api = mockProfileApi();
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(await screen.findByRole('button', { name: 'Meni računa' })).toBeInTheDocument();
    const sync = api.requests.filter((r) => r.method === 'PUT' && r.path === '/api/me');
    expect(sync).toHaveLength(1);
    expect(sync[0]?.authorization).toBe('Bearer token-uid-ana');
  });

  it.each([
    ['cancelled', 'Prijava je bila prekinjena. Poskusi znova.'],
    [
      'popup-blocked',
      'Brskalnik je blokiral okno za prijavo. Dovoli pojavna okna za to stran in poskusi znova.',
    ],
    ['offline', 'Ni povezave. Preveri povezavo in poskusi znova.'],
    ['failed', 'Prijava ni uspela. Poskusi znova.'],
  ] as [SignInErrorCode, string][])(
    'FR-001-04: neuspela prijava (%s) prikaže sporočilo v kartici in dovoli ponoven poskus',
    async (code, message) => {
      const api = mockProfileApi();
      const gateway = createAuthFake();
      gateway.failNextSignIn(code);
      const { user } = renderApp('/login', { gateway });

      await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(currentLocation()).toBe('/login');
      expect(gateway.currentUser).toBeNull();
      expect(api.requests).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
      await waitFor(() => expect(currentLocation()).toBe('/'));
    },
  );

  it('FR-001-04: če zaledje profila ne more ustvariti, uporabnik ostane neprijavljen', async () => {
    mockProfileApi({ meStatus: 500 });
    const gateway = createAuthFake();
    const { user } = renderApp('/login', { gateway });

    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Prijava ni uspela. Poskusi znova.');
    await waitFor(() => expect(gateway.currentUser).toBeNull());
    expect(gateway.signOutCalls).toBeGreaterThanOrEqual(1);
    expect(currentLocation()).toBe('/login');
    expect(screen.queryByRole('button', { name: 'Meni računa' })).not.toBeInTheDocument();
  });

  it('FR-001-05: prijavljen uporabnik na strani za prijavo gre na začetno stran', async () => {
    mockProfileApi();
    renderApp('/login', { gateway: createAuthFake({ user: ANA }) });

    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(screen.queryByRole('button', { name: 'Prijava z Googlom' })).not.toBeInTheDocument();
  });

  it('FR-001-05: prijavljen uporabnik na /login?next=/account gre na ciljno pot', async () => {
    mockProfileApi();
    renderApp('/login?next=%2Faccount', { gateway: createAuthFake({ user: ANA }) });

    await waitFor(() => expect(currentLocation()).toBe('/account'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Moj račun' })).toBeInTheDocument();
  });

  it('FR-001-15: preklop jezika pod kartico zamenja jezik in ga shrani na napravi', async () => {
    const { user } = renderApp('/login');
    const languages = await screen.findByRole('group', { name: 'Jezik' });

    expect(within(languages).getByRole('button', { name: 'Slovenščina' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(languages).getByRole('button', { name: 'English' }));

    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Sign in – Contacts');
    expect(localStorage.getItem('language')).toBe('en');
    expect(
      within(screen.getByRole('group', { name: 'Language' })).getByRole('button', {
        name: 'English',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('FR-001-18: naslov strani je »Prijava – Kontakti«', async () => {
    renderApp('/login');

    await screen.findByRole('button', { name: 'Prijava z Googlom' });
    expect(document.title).toBe('Prijava – Kontakti');
  });

  it('FR-001-01: stran za prijavo nima kršitev axe (tudi s sporočilom napake)', async () => {
    const gateway = createAuthFake();
    gateway.failNextSignIn('cancelled');
    const { container, user } = renderApp('/login', { gateway });
    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));
    await screen.findByRole('alert');

    const results = await axe(container);

    expect(results.violations).toEqual([]);
  });
});
