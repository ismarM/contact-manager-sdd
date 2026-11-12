import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { currentLocation } from '../../test/renderApp';
import {
  accountRegion,
  captureDownloads,
  deferredReply,
  myData,
  renderAccountApp,
  replies,
} from '../../test/myDataApi';

const DESCRIPTION_SL =
  'Izvoz vsebuje tvoje osebne podatke, članstva v skupinah, prejeta in poslana povabila ter skupine, katerih lastnik si. Kontaktov in revizijskih sledi ne vsebuje.';
const DESCRIPTION_EN =
  'The export contains your personal data, group memberships, received and sent invitations and the groups you own. It does not contain contacts or audit trails.';

const isDisabled = (element: HTMLElement) =>
  (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true';

describe('MyDataSection – razdelek Moji podatki', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('FR-012-01: region »Moji podatki« z razlago in gumbom »Prenesi moje podatke (JSON)« (sl)', async () => {
    renderAccountApp();

    const region = await accountRegion('Moji podatki');
    expect(within(region).getByRole('heading', { level: 2, name: 'Moji podatki' })).toBeVisible();
    expect(region).toBeVisible();
    expect(region).toHaveTextContent(DESCRIPTION_SL);
    expect(
      within(region).getByRole('button', { name: 'Prenesi moje podatke (JSON)' }),
    ).toBeEnabled();
  });

  it('FR-012-01: region »My data« z razlago in gumbom »Download my data (JSON)« (en)', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    renderAccountApp();

    const region = await accountRegion('My data');
    expect(region).toBeVisible();
    expect(region).toHaveTextContent(DESCRIPTION_EN);
    expect(
      within(region).getByRole('button', { name: 'Download my data (JSON)' }),
    ).toBeInTheDocument();
  });

  it('FR-012-02: klik pokliče GET /api/me/export z Authorization in prenese datoteko z vsebino odgovora', async () => {
    const downloads = captureDownloads();
    const data = myData();
    const { user, api } = renderAccountApp({ exportData: replies.exported(data) });

    const region = await accountRegion('Moji podatki');
    await user.click(within(region).getByRole('button', { name: 'Prenesi moje podatke (JSON)' }));

    expect(await within(region).findByRole('status')).toHaveTextContent('Podatki so preneseni.');
    expect(api.exportRequests()).toHaveLength(1);
    expect(api.exportRequests()[0]?.method).toBe('GET');
    expect(api.exportRequests()[0]?.authorization).toBe('Bearer token-uid-ana');
    expect(downloads.names).toHaveLength(1);
    expect(downloads.names[0]).toMatch(/^moji-podatki-\d{4}-\d{2}-\d{2}\.json$/);
    const [text] = await downloads.texts();
    expect(JSON.parse(text ?? '') as unknown).toEqual(data);
  });

  it('FR-012-02: ime datoteke nosi LOKALNI datum, ne UTC (blizu polnoči)', async () => {
    // 2026-11-12 23:30 UTC = 2026-11-13 00:30 v Europe/Ljubljana (vitest.config.ts): lokalni datum je 13., UTC datum 12.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T23:30:00Z'));
    const downloads = captureDownloads();
    const { user } = renderAccountApp();

    const region = await accountRegion('Moji podatki');
    await user.click(within(region).getByRole('button', { name: 'Prenesi moje podatke (JSON)' }));

    await within(region).findByRole('status');
    expect(downloads.names).toEqual(['moji-podatki-2026-11-13.json']);
  });

  it('FR-012-02: med klicem je gumb aria-busy in onemogočen, ob uspehu spet omogočen', async () => {
    captureDownloads();
    const pending = deferredReply();
    const { user, api } = renderAccountApp({ exportData: pending.source });

    const region = await accountRegion('Moji podatki');
    const button = within(region).getByRole('button', { name: 'Prenesi moje podatke (JSON)' });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(isDisabled(button)).toBe(true);
    await user.click(button);
    expect(api.exportRequests()).toHaveLength(1);

    pending.release(replies.exported());

    expect(await within(region).findByRole('status')).toHaveTextContent('Podatki so preneseni.');
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    expect(isDisabled(button)).toBe(false);
  });

  it.each([
    ['napaka zaledja 500', replies.serverError],
    ['brez povezave', replies.networkError],
  ] as const)(
    'FR-012-04: %s – alert in »Poskusi znova«, datoteke ni, ponovni poskus uspe',
    async (_label, failure) => {
      const downloads = captureDownloads();
      const { user, api } = renderAccountApp({
        exportData: (call) => (call === 1 ? failure : replies.exported()),
      });

      const region = await accountRegion('Moji podatki');
      await user.click(within(region).getByRole('button', { name: 'Prenesi moje podatke (JSON)' }));

      expect(await within(region).findByRole('alert')).toHaveTextContent(
        'Podatkov ni bilo mogoče pripraviti. Poskusi znova.',
      );
      expect(downloads.names).toEqual([]);
      expect(within(region).queryByRole('status')).not.toBeInTheDocument();
      expect(currentLocation()).toBe('/account');

      await user.click(within(region).getByRole('button', { name: 'Poskusi znova' }));

      expect(await within(region).findByRole('status')).toHaveTextContent('Podatki so preneseni.');
      expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
      expect(api.exportRequests()).toHaveLength(2);
      expect(downloads.names).toHaveLength(1);
    },
  );

  it('FR-012-04: napaka v angleščini – »Your data could not be prepared. Please try again.« in »Try again«', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    captureDownloads();
    const { user } = renderAccountApp({ exportData: replies.serverError });

    const region = await screen.findByRole('region', { name: 'My data' });
    await user.click(within(region).getByRole('button', { name: 'Download my data (JSON)' }));

    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'Your data could not be prepared. Please try again.',
    );
    expect(within(region).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('FR-012-01: 401 ob izvozu je izguba seje – prijava s poteklo sejo, brez datoteke', async () => {
    const downloads = captureDownloads();
    const { user, gateway } = renderAccountApp({ exportData: replies.unauthenticated });

    const region = await accountRegion('Moji podatki');
    await user.click(within(region).getByRole('button', { name: 'Prenesi moje podatke (JSON)' }));

    await waitFor(() => expect(currentLocation()).toMatch(/^\/login\?reason=session-expired/));
    expect(downloads.names).toEqual([]);
    expect(gateway.signOutCalls).toBe(1);
  });

  it.each(['light', 'dark'] as const)(
    'FR-012-01: razdelek Moji podatki nima kršitev axe (tema %s, tudi z napako)',
    async (theme) => {
      localStorage.setItem('theme', theme);
      document.documentElement.dataset.theme = theme;
      captureDownloads();
      const { user, container } = renderAccountApp({ exportData: replies.serverError });
      const region = await accountRegion('Moji podatki');
      expect((await axe(container)).violations).toEqual([]);

      await user.click(within(region).getByRole('button', { name: 'Prenesi moje podatke (JSON)' }));
      await within(region).findByRole('alert');

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
