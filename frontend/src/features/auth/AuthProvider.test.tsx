import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { ANA_PROFILE, mockProfileApi, renderApp } from '../../test/renderApp';

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
