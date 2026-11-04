import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../i18n';
import { StartPage } from './StartPage';

describe('StartPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('FR-000-14: izriše besedni znak v slovenščini in nastavi <html lang>', () => {
    render(<StartPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Kontakti' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('sl');
  });

  it('FR-000-14: preklop jezika zamenja besedila, lang in naslov brez ponovnega nalaganja', async () => {
    render(<StartPage />);

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Contacts' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Contacts');
  });

  it('FR-000-12: začetna stran nima kršitev axe', async () => {
    const { container } = render(<StartPage />);

    const results = await axe(container);

    expect(results.violations).toEqual([]);
  });

  it('FR-000-12: začetna stran ne pošlje nobenega zahtevka', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<StartPage />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
