import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { mockProfileApi, renderApp } from '../../test/renderApp';
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-001-13: neobstoječa pot prikaže »Te strani ni« s povezavo na seznam skupin', async () => {
    mockProfileApi();
    renderApp('/ne-obstaja', { gateway: createAuthFake({ user: ANA }) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent(
      'Povezava je napačna ali pa stran ni več na voljo.',
    );
    expect(screen.getByRole('link', { name: 'Na seznam skupin' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('FR-001-18: naslov strani v izbranem jeziku', async () => {
    mockProfileApi();
    renderApp('/ne-obstaja', { gateway: createAuthFake({ user: ANA }) });
    await screen.findByRole('heading', { level: 1, name: 'Te strani ni' });
    expect(document.title).toBe('Te strani ni – Kontakti');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to groups' })).toBeInTheDocument();
    expect(document.title).toBe('Page not found – Contacts');
  });

  it('FR-001-13: komponento lahko uporabijo druge funkcionalnosti (npr. ob 404 za vir)', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Te strani ni' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Na seznam skupin' })).toHaveAttribute('href', '/');
  });

  it('FR-001-13: stran v ogrodju nima kršitev axe', async () => {
    mockProfileApi();
    const { container } = renderApp('/ne-obstaja', { gateway: createAuthFake({ user: ANA }) });
    await screen.findByRole('heading', { level: 1, name: 'Te strani ni' });

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-001-13: izolirana komponenta nima kršitev axe', async () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Te strani ni' })).toBeInTheDocument();

    expect((await axe(container)).violations).toEqual([]);
  });
});
