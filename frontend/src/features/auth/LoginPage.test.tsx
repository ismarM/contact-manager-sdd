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

describe('LoginPage – potrdilo po izbrisu računa', () => {
  const SL = 'Tvoj račun je izbrisan.';
  const SL_PENDING =
    'Tvoj račun je izbrisan. Brisanje povezave z Google računom še poteka, zato se z istim Google računom nekaj časa morda ne boš mogel znova registrirati. Poskusi znova čez nekaj minut.';
  const EN = 'Your account has been deleted.';
  const EN_PENDING =
    'Your account has been deleted. Removing the link to your Google account is still in progress, so you may not be able to register again with the same Google account for a while. Please try again in a few minutes.';

  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-012-17: reason=account-deleted prikaže status »Tvoj račun je izbrisan.« brez opozorila o poteku seje', async () => {
    renderApp('/login?reason=account-deleted');

    expect(await screen.findByRole('status')).toHaveTextContent(new RegExp(`^${SL}$`));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prijava z Googlom' })).toBeVisible();
  });

  it('FR-012-17: reason=account-deleted-pending prikaže razširjeno besedilo o čakanju', async () => {
    renderApp('/login?reason=account-deleted-pending');

    expect(await screen.findByRole('status')).toHaveTextContent(SL_PENDING);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-012-17: angleška sporočila za obe stanji', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    const first = renderApp('/login?reason=account-deleted');
    expect(await screen.findByRole('status')).toHaveTextContent(new RegExp(`^${EN}$`));
    first.unmount();

    renderApp('/login?reason=account-deleted-pending');
    expect(await screen.findByRole('status')).toHaveTextContent(EN_PENDING);
  });

  it('FR-012-17: preklop jezika pod kartico prevede sporočilo', async () => {
    const { user } = renderApp('/login?reason=account-deleted');
    expect(await screen.findByRole('status')).toHaveTextContent(SL);

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(await screen.findByRole('status')).toHaveTextContent(EN);
  });

  it.each(['/login', '/login?reason=neznan'])(
    'FR-012-17: brez razloga izbrisa (%s) statusa ni',
    async (path) => {
      renderApp(path);

      await screen.findByRole('button', { name: 'Prijava z Googlom' });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
  );

  it('FR-012-17: sporočilo o poteku seje se ne prikaže skupaj s potrdilom o izbrisu', async () => {
    renderApp('/login?reason=account-deleted');

    await screen.findByRole('status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveTextContent('Seja je potekla. Prijavi se znova.');
  });

  it('FR-012-17: potrdilo se porabi ob prikazu – po novi prijavi in odjavi ga ni več', async () => {
    mockProfileApi();
    const { user } = renderApp('/login?reason=account-deleted');
    expect(await screen.findByRole('status')).toHaveTextContent(SL);

    await user.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
    await waitFor(() => expect(currentLocation()).toBe('/'));
    await user.click(await screen.findByRole('button', { name: 'Meni računa' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Odjava' }));

    await waitFor(() => expect(currentLocation()).toBe('/login'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['light', 'dark'] as const)(
    'FR-012-17: stran za prijavo s potrdilom o izbrisu nima kršitev axe (tema %s)',
    async (theme) => {
      localStorage.setItem('theme', theme);
      document.documentElement.dataset.theme = theme;
      const { container, unmount } = renderApp('/login?reason=account-deleted');
      await screen.findByRole('status');
      expect((await axe(container)).violations).toEqual([]);
      unmount();

      const pending = renderApp('/login?reason=account-deleted-pending');
      await screen.findByRole('status');
      expect((await axe(pending.container)).violations).toEqual([]);
    },
  );
});
