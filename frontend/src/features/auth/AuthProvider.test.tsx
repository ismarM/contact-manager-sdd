import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { confirmDeletion, openDeleteDialog, renderAccountApp, replies } from '../../test/myDataApi';
import { ANA_PROFILE, currentLocation, mockProfileApi, renderApp } from '../../test/renderApp';

describe('AuthProvider – sinhronizacija profila in izbire', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-001-03: ob nalaganju s prijavljenim uporabnikom se profil sinhronizira z izbiro naprave', async () => {
    localStorage.setItem('language', 'sl');
    localStorage.setItem('theme', 'light');
    const api = mockProfileApi();

    renderApp('/', { gateway: createAuthFake({ user: ANA }) });

    await waitFor(() => expect(api.requests.filter((r) => r.path === '/api/me')).toHaveLength(1));
    const sync = api.requests.find((r) => r.path === '/api/me');
    expect(sync?.method).toBe('PUT');
    expect(sync?.authorization).toBe('Bearer token-uid-ana');
    expect(sync?.body).toEqual({ language: 'sl', theme: 'light' });
  });

  it('FR-001-19: izbira iz profila preglasi izbiro naprave in se shrani na napravi', async () => {
    localStorage.setItem('language', 'sl');
    localStorage.setItem('theme', 'light');
    document.documentElement.dataset.theme = 'light';
    mockProfileApi({ profile: { ...ANA_PROFILE, language: 'en', theme: 'dark' } });

    renderApp('/', { gateway: createAuthFake({ user: ANA }) });

    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('language')).toBe('en');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('FR-001-19: naprava brez izbire pošlje null, prazen profil pusti privzeto', async () => {
    const api = mockProfileApi();

    renderApp('/', { gateway: createAuthFake({ user: ANA }) });

    await waitFor(() => expect(api.requests.filter((r) => r.path === '/api/me')).toHaveLength(1));
    expect(api.requests.find((r) => r.path === '/api/me')?.body).toEqual({
      language: null,
      theme: null,
    });
    expect(await screen.findByRole('button', { name: 'Meni računa' })).toBeInTheDocument();
    expect(localStorage.getItem('language')).toBeNull();
    expect(localStorage.getItem('theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('AuthProvider – izbris računa (accountDeleted)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Beleži vse poti, ki jih usmerjevalnik zapiše v zgodovino brskalnika. */
  function recordNavigation() {
    const visited: string[] = [];
    const push = window.history.pushState.bind(window.history);
    const replace = window.history.replaceState.bind(window.history);
    const note = (url: string | URL | null | undefined) => {
      if (url !== undefined && url !== null) visited.push(String(url));
    };
    vi.spyOn(window.history, 'pushState').mockImplementation((data, unused, url) => {
      note(url);
      push(data, unused, url);
    });
    vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
      note(url);
      replace(data, unused, url);
    });
    return visited;
  }

  it('FR-012-14 FR-012-17: 204 počisti sejo, pokliče gateway.signOut() in vodi na /login?reason=account-deleted brez sporočila o poteku seje', async () => {
    const { user, gateway, api } = renderAccountApp({ deletion: replies.deleted });
    const dialog = await openDeleteDialog(user);
    const visited = recordNavigation();
    const apiCallsBefore = api.requests.length;

    await confirmDeletion(user, dialog);

    await waitFor(() => expect(currentLocation()).toBe('/login?reason=account-deleted'));
    expect(gateway.signOutCalls).toBe(1);
    expect(gateway.currentUser).toBeNull();
    expect(await screen.findByRole('button', { name: 'Prijava z Googlom' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveTextContent('Seja je potekla. Prijavi se znova.');
    expect(visited.some((url) => url.includes('session-expired'))).toBe(false);
    // Po izbrisu ni več zahtevkov s sejo (razen izbrisa samega).
    expect(api.requests.slice(apiCallsBefore).map((r) => r.path)).toEqual(['/api/me/deletion']);
  });

  it('FR-012-17: 202 vodi na /login?reason=account-deleted-pending, tudi brez sporočila o poteku seje', async () => {
    const { user, gateway } = renderAccountApp({ deletion: replies.pending });
    const dialog = await openDeleteDialog(user);
    const visited = recordNavigation();

    await confirmDeletion(user, dialog);

    await waitFor(() => expect(currentLocation()).toBe('/login?reason=account-deleted-pending'));
    expect(gateway.signOutCalls).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(visited.some((url) => url.includes('session-expired'))).toBe(false);
  });

  it('FR-012-14: po izbrisu je mogoča nova prijava (nov, prazen profil)', async () => {
    const { user, gateway, profile } = renderAccountApp({ deletion: replies.deleted });
    const dialog = await openDeleteDialog(user);
    await confirmDeletion(user, dialog);
    await waitFor(() => expect(currentLocation()).toBe('/login?reason=account-deleted'));
    const syncsBefore = profile.requests.filter((r) => r.path === '/api/me').length;

    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(gateway.signInCalls).toBe(1);
    expect(profile.requests.filter((r) => r.path === '/api/me')).toHaveLength(syncsBefore + 1);
  });
});
