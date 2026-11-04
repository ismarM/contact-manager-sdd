import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../i18n';
import { ANA, createAuthFake } from '../test/authFake';
import { currentLocation, mockProfileApi, renderApp } from '../test/renderApp';

const searchParam = (name: string) => new URLSearchParams(window.location.search).get(name);

describe('zaščitene poti, odjava in potek seje', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-001-06: neprijavljen ne vidi zaščitene vsebine niti med nalaganjem in je preusmerjen na prijavo', async () => {
    mockProfileApi();
    const gateway = createAuthFake({ initialStateKnown: false });
    renderApp('/account?x=1', { gateway });

    expect(screen.queryByRole('heading', { name: 'Moj račun' })).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();

    act(() => gateway.resolveInitialState());

    expect(await screen.findByRole('button', { name: 'Prijava z Googlom' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(searchParam('next')).toBe('/account?x=1');
    expect(screen.queryByRole('heading', { name: 'Moj račun' })).not.toBeInTheDocument();
  });

  it('FR-001-06: po prijavi se vrne na zahtevano pot s parametri', async () => {
    mockProfileApi();
    const { user } = renderApp('/account?x=1');

    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

    await waitFor(() => expect(currentLocation()).toBe('/account?x=1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Moj račun' })).toBeInTheDocument();
  });

  it('FR-001-06: ciljna pot na tuj izvor se prezre', async () => {
    mockProfileApi();
    const { user } = renderApp('/login?next=%2F%2Fzlonamerno.si');

    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });

  it('FR-001-06: neprijavljen na neobstoječi poti gre na prijavo, po prijavi vidi »Te strani ni«', async () => {
    mockProfileApi();
    const { user } = renderApp('/ne-obstaja');

    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(currentLocation()).toBe('/ne-obstaja');
  });

  it('FR-001-09: odjava v meniju konča sejo, odstrani podatke in Nazaj ne prikaže zaščitene vsebine', async () => {
    const api = mockProfileApi();
    const gateway = createAuthFake({ user: ANA });
    const { user } = renderApp('/', { gateway });
    // Zgodovina z zaščitenima vnosoma: / → (meni) /account.
    await user.click(await screen.findByRole('button', { name: 'Meni računa' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Moj račun' }));
    await screen.findByRole('heading', { level: 2, name: 'Profil' });
    expect(currentLocation()).toBe('/account');
    expect(screen.getByRole('main')).toHaveTextContent('Ana Novak');

    await user.click(screen.getByRole('button', { name: 'Meni računa' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Odjava' }));

    expect(await screen.findByRole('button', { name: 'Prijava z Googlom' })).toBeInTheDocument();
    expect(currentLocation()).toBe('/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(gateway.signOutCalls).toBe(1);
    expect(document.body).not.toHaveTextContent('Ana Novak');
    const requestsAfterSignOut = api.requests.length;

    // Nazaj: prejšnji vnos je zaščitena pot »/« – preusmeritev na prijavo s ciljno potjo »/«.
    act(() => window.history.back());

    await waitFor(() => expect(searchParam('next')).toBe('/'));
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('button', { name: 'Prijava z Googlom' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Ana Novak');

    // Ponovno odprta prej obiskana zaščitena pot.
    act(() => {
      window.history.pushState({}, '', '/account');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(searchParam('next')).toBe('/account'));
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Moj račun' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Ana Novak');
    expect(api.requests).toHaveLength(requestsAfterSignOut);
  });

  it('FR-001-10: 401 z zaledja vodi na prijavo s sporočilom in po prijavi nazaj', async () => {
    mockProfileApi({ preferencesStatus: 401 });
    const gateway = createAuthFake({ user: ANA });
    const { user } = renderApp('/account', { gateway });
    const theme = await screen.findByRole('group', { name: 'Tema' });

    await user.click(within(theme).getByRole('radio', { name: 'Temna' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seja je potekla. Prijavi se znova.',
    );
    expect(window.location.pathname).toBe('/login');
    expect(searchParam('next')).toBe('/account');

    await user.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
    await waitFor(() => expect(currentLocation()).toBe('/account'));
  });

  it('FR-001-10: odjava v drugem zavihku vodi na prijavo s sporočilom o poteku seje', async () => {
    mockProfileApi();
    const gateway = createAuthFake({ user: ANA });
    const { user } = renderApp('/account', { gateway });
    await screen.findByRole('heading', { level: 1, name: 'Moj račun' });

    act(() => gateway.emitSignedOut());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seja je potekla. Prijavi se znova.',
    );
    expect(window.location.pathname).toBe('/login');
    expect(searchParam('next')).toBe('/account');
    expect(gateway.signOutCalls).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
    await waitFor(() => expect(currentLocation()).toBe('/account'));
  });

  it('FR-001-10: prva interakcija po odjavi v drugem zavihku ne pošlje zahtevka in vodi na prijavo', async () => {
    const api = mockProfileApi();
    const gateway = createAuthFake({ user: ANA });
    const { user } = renderApp('/account', { gateway });
    const languages = await screen.findByRole('group', { name: 'Jezik' });
    gateway.dropUserSilently();

    await user.click(within(languages).getByRole('radio', { name: 'English' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Seja je potekla\. Prijavi se znova\.|Your session has expired\. Please sign in again\./,
    );
    expect(window.location.pathname).toBe('/login');
    expect(searchParam('next')).toBe('/account');
    expect(api.requests.filter((r) => r.path === '/api/me/preferences')).toHaveLength(0);

    await user.click(
      screen.getByRole('button', { name: /^(Prijava z Googlom|Sign in with Google)$/ }),
    );
    await waitFor(() => expect(currentLocation()).toBe('/account'));
  });

  it('FR-001-10: žetona ni mogoče podaljšati – prva interakcija vodi na prijavo s sporočilom in nazaj', async () => {
    const api = mockProfileApi();
    const gateway = createAuthFake({ user: ANA });
    const { user } = renderApp('/account', { gateway });
    const theme = await screen.findByRole('group', { name: 'Tema' });
    gateway.failTokenRefresh();

    await user.click(within(theme).getByRole('radio', { name: 'Temna' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seja je potekla. Prijavi se znova.',
    );
    expect(window.location.pathname).toBe('/login');
    expect(searchParam('reason')).toBe('session-expired');
    expect(searchParam('next')).toBe('/account');
    expect(api.requests.filter((r) => r.path === '/api/me/preferences')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
    await waitFor(() => expect(currentLocation()).toBe('/account'));
  });
});
