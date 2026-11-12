import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { duplicatesReply, GROUP_ID, renderDuplicatesApp } from '../../test/duplicatesApi';

// Zavihek, razlaga za bralca in arhivirano skupino ter iskalni obrazec (FR-011-01, FR-011-02, FR-011-19;
// specs/011-dvojniki/plan.md – Pages and routes, Key elements).

const PAGE = `/groups/${GROUP_ID}/duplicates`;

type Options = NonNullable<Parameters<typeof renderDuplicatesApp>[1]>;

/** Navigacija glave skupine, ko je skupina naložena. */
async function sections() {
  const header = await screen.findByRole('region', { name: 'Projekt FERI' });
  return within(within(header).getByRole('navigation', { name: 'Razdelki skupine' }));
}

describe('DuplicatesPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it.each(['EDITOR', 'ADMIN', 'OWNER'] as const)(
    'FR-011-01: %s nearhivirane skupine vidi v glavi povezavo »Dvojniki«',
    async (role) => {
      renderDuplicatesApp(`/groups/${GROUP_ID}/contacts`, { role });

      const nav = await sections();
      expect(await nav.findByRole('link', { name: 'Dvojniki' })).toHaveAttribute('href', PAGE);
    },
  );

  it.each([
    ['bralec nearhivirane skupine', { role: 'VIEWER' }],
    ['urednik arhivirane skupine', { role: 'EDITOR', archived: true }],
    ['bralec arhivirane skupine', { role: 'VIEWER', archived: true }],
    ['admin arhivirane skupine', { role: 'ADMIN', archived: true }],
    ['lastnik arhivirane skupine', { role: 'OWNER', archived: true }],
  ] as [string, Options][])('FR-011-01: %s – povezave »Dvojniki« ni', async (_who, options) => {
    renderDuplicatesApp(`/groups/${GROUP_ID}/contacts`, options);

    const nav = await sections();
    expect(await nav.findByRole('link', { name: 'Kontakti' })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Dvojniki' })).not.toBeInTheDocument();
  });

  it('FR-011-01: bralec na poti …/duplicates dobi razlago in povezavo na kontakte, brez obrazca in brez klica API', async () => {
    const { duplicatesApi } = renderDuplicatesApp(PAGE, { role: 'VIEWER' });

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Dvojnike lahko išče in združuje urednik ali višja vloga.',
    );
    expect(screen.getByRole('link', { name: 'Na kontakte skupine' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts`,
    );
    expect(screen.queryByRole('radiogroup', { name: 'Kategorija' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Poišči dvojnike' })).not.toBeInTheDocument();
    expect(duplicatesApi.requests).toHaveLength(0);
  });

  it('FR-011-19: v arhivirani skupini urednik dobi razlago, brez obrazca in brez klica API', async () => {
    const { duplicatesApi } = renderDuplicatesApp(PAGE, { role: 'EDITOR', archived: true });

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Skupina je arhivirana – iskanje dvojnikov ni na voljo.',
    );
    expect(screen.getByRole('link', { name: 'Na kontakte skupine' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Kategorija' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Poišči dvojnike' })).not.toBeInTheDocument();
    expect(duplicatesApi.requests).toHaveLength(0);
  });

  it('FR-011-02: urednik vidi izbiro kategorije (privzeto »Ime in priimek«) in gumb »Poišči dvojnike«, brez samodejnega iskanja', async () => {
    const { duplicatesApi } = renderDuplicatesApp(PAGE, { role: 'EDITOR' });

    expect(await screen.findByRole('heading', { level: 2, name: 'Dvojniki' })).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Kategorija' });
    expect(within(group).getByRole('radio', { name: 'Ime in priimek' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'E-naslov' })).not.toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Telefon' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Poišči dvojnike' })).toBeInTheDocument();
    expect(duplicatesApi.requests).toHaveLength(0);
  });

  it('FR-011-02: izbira »E-naslov« in klik pošlje category=email&page=0&size=25, naslov strani vsebuje category=email', async () => {
    const { user, duplicatesApi } = renderDuplicatesApp(PAGE, { role: 'EDITOR' });
    await user.click(await screen.findByRole('radio', { name: 'E-naslov' }));
    await user.click(screen.getByRole('button', { name: 'Poišči dvojnike' }));

    await waitFor(() => expect(duplicatesApi.gets('')).toHaveLength(1));
    expect(duplicatesApi.gets('')[0]?.search.toString()).toBe('category=email&page=0&size=25');
    expect(window.location.pathname).toBe(PAGE);
    expect(new URLSearchParams(window.location.search).get('category')).toBe('email');
  });

  it('FR-011-02: osvežitev – pot z category=phone&page=2 ob izrisu naloži rezultate, »Telefon« je izbran', async () => {
    const { duplicatesApi } = renderDuplicatesApp(`${PAGE}?category=phone&page=2`, {
      role: 'EDITOR',
      duplicates: { search: () => duplicatesReply([], { category: 'phone', page: 1 }) },
    });

    expect(await screen.findByRole('radio', { name: 'Telefon' })).toBeChecked();
    await waitFor(() => expect(duplicatesApi.gets('')).toHaveLength(1));
    expect(duplicatesApi.gets('')[0]?.search.toString()).toBe('category=phone&page=1&size=25');
  });

  it('FR-011-02: neznana category v naslovu – obrazec brez rezultatov in brez klica API', async () => {
    const { duplicatesApi } = renderDuplicatesApp(`${PAGE}?category=foo`, { role: 'EDITOR' });

    expect(await screen.findByRole('radiogroup', { name: 'Kategorija' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poišči dvojnike' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Skupine dvojnikov' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(duplicatesApi.requests).toHaveLength(0);
  });

  it('FR-011-01: neznana podpot …/duplicates/xyz – »Te strani ni«', async () => {
    renderDuplicatesApp(`${PAGE}/xyz`, { role: 'EDITOR' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Dvojniki' })).not.toBeInTheDocument();
  });

  it('FR-011-01: stran je v angleščini (Duplicates, Category, Find duplicates, razlaga za bralca)', async () => {
    await i18n.changeLanguage('en');
    const { unmount } = renderDuplicatesApp(PAGE, { role: 'EDITOR' });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Duplicates' }),
    ).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Category' });
    expect(within(group).getByRole('radio', { name: 'Name and surname' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Email' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Phone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find duplicates' })).toBeInTheDocument();
    unmount();

    renderDuplicatesApp(PAGE, { role: 'VIEWER' });
    expect(await screen.findByRole('note')).toHaveTextContent(
      'Duplicates can be searched and merged by an editor or higher role.',
    );
    expect(screen.getByRole('link', { name: 'Go to group contacts' })).toBeInTheDocument();
  });

  it('FR-011-01: axe brez kršitev (obrazec urednika, razlaga bralca, razlaga arhivirane skupine)', async () => {
    const editor = renderDuplicatesApp(PAGE, { role: 'EDITOR' });
    await screen.findByRole('button', { name: 'Poišči dvojnike' });
    expect((await axe(editor.container)).violations).toEqual([]);
    editor.unmount();

    const viewer = renderDuplicatesApp(PAGE, { role: 'VIEWER' });
    await screen.findByRole('note');
    expect((await axe(viewer.container)).violations).toEqual([]);
    viewer.unmount();

    const archived = renderDuplicatesApp(PAGE, { role: 'EDITOR', archived: true });
    await screen.findByRole('note');
    expect((await axe(archived.container)).violations).toEqual([]);
  });
});
