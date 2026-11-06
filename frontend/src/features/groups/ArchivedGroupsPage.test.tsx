import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { archivedReply, archivedSummary, groupId, renderGroupsApp } from '../../test/groupsApi';

// Zaslon *Arhivirane skupine* (FR-003-07, FR-003-08; plan.md – Key elements; design.md 8.9, 9.2).

describe('ArchivedGroupsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-003-07: vrstica ima naslov, opis, število kontaktov, vlogo in oznako Arhivirano; naslov strani', async () => {
    renderGroupsApp('/groups/archived', {
      listArchived: archivedReply([
        archivedSummary(1, {
          title: 'Konferenca 2025',
          description: 'Kontakti konference',
          role: 'EDITOR',
          contactCount: 12,
        }),
      ]),
    });

    const main = await screen.findByRole('main');
    expect(
      await within(main).findByRole('heading', { level: 1, name: 'Arhivirane skupine' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Arhivirane skupine – Kontakti'));
    const row = await within(main).findByRole('listitem');
    expect(within(row).getByRole('link', { name: 'Konferenca 2025' })).toHaveAttribute(
      'href',
      `/groups/${groupId(1)}`,
    );
    expect(row).toHaveTextContent('Kontakti konference');
    expect(row).toHaveTextContent('12 kontaktov');
    expect(row).toHaveTextContent('Vloga: Urednik');
    expect(row).toHaveTextContent('Arhivirano');
    expect(row).not.toHaveTextContent('izbrisan uporabnik');
  });

  it('FR-003-08: trajno arhivirana skupina ima opombo »lastnik: izbrisan uporabnik«', async () => {
    renderGroupsApp('/groups/archived', {
      listArchived: archivedReply([
        archivedSummary(1, { title: 'Brez lastnika', role: 'VIEWER', permanentlyArchived: true }),
        archivedSummary(2, { title: 'Z lastnikom' }),
      ]),
    });

    const rows = await within(await screen.findByRole('main')).findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('lastnik: izbrisan uporabnik');
    expect(rows[1]).not.toHaveTextContent('izbrisan uporabnik');
  });

  it('FR-003-07: 30 skupin – prvih 25, paginacija in naslednja stran', async () => {
    const all = Array.from({ length: 30 }, (_, i) => archivedSummary(i + 1));
    const { user, api } = renderGroupsApp('/groups/archived', { listArchived: archivedReply(all) });

    const main = await screen.findByRole('main');
    expect(await within(main).findAllByRole('listitem')).toHaveLength(25);
    const pagination = within(main).getByRole('navigation', {
      name: 'Strani rezultatov: Arhivirane skupine',
    });
    expect(within(pagination).getByRole('status')).toHaveTextContent('1–25 od 30');

    await user.click(within(pagination).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() => expect(within(main).getAllByRole('listitem')).toHaveLength(5));
    const request = api.of('GET', '/api/groups/archived').at(-1);
    expect(request?.search.get('page')).toBe('1');
    expect(request?.search.get('size')).toBe('25');
    expect(pagination).toBeInTheDocument();
  });

  it('FR-003-07: izbira velikosti strani 50 pokaže vseh 30 skupin in zahteva size=50', async () => {
    const all = Array.from({ length: 30 }, (_, i) => archivedSummary(i + 1));
    const { user, api } = renderGroupsApp('/groups/archived', { listArchived: archivedReply(all) });
    const main = await screen.findByRole('main');
    await within(main).findAllByRole('listitem');

    await user.selectOptions(within(main).getByRole('combobox', { name: 'Velikost strani' }), '50');

    await waitFor(() => expect(within(main).getAllByRole('listitem')).toHaveLength(30));
    const request = api.of('GET', '/api/groups/archived').at(-1);
    expect(request?.search.get('size')).toBe('50');
    expect(request?.search.get('page')).toBe('0');
    expect(
      within(
        within(main).getByRole('navigation', { name: 'Strani rezultatov: Arhivirane skupine' }),
      ).getByRole('status'),
    ).toHaveTextContent('1–30 od 30');
  });

  it('FR-003-07: brez skupin – prazno stanje s povezavo na seznam skupin', async () => {
    renderGroupsApp('/groups/archived');

    const main = await screen.findByRole('main');
    expect(
      await within(main).findByRole('heading', { level: 2, name: 'Nimaš arhiviranih skupin.' }),
    ).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: 'Na seznam skupin' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(main).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('FR-003-07: napaka nalaganja – opozorilo in Poskusi znova', async () => {
    let fail = true;
    const { user } = renderGroupsApp('/groups/archived', {
      listArchived: (url) =>
        fail ? { status: 500 } : archivedReply([archivedSummary(1, { title: 'Nazaj' })])(url),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Skupin ni bilo mogoče naložiti. Poskusi znova.');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(await screen.findByRole('link', { name: 'Nazaj' })).toBeInTheDocument();
  });

  it.each(['sl', 'en'])('FR-003-07: brez kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = renderGroupsApp('/groups/archived', {
      listArchived: archivedReply([
        archivedSummary(1, { permanentlyArchived: true, description: 'Opis' }),
      ]),
    });

    await screen.findByRole('link', { name: 'Arhiv 001' });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-003-07: angleški naslov strani in zaslona', async () => {
    await i18n.changeLanguage('en');
    renderGroupsApp('/groups/archived');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Archived groups' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Archived groups – Contacts'));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'You have no archived groups.' }),
    ).toBeInTheDocument();
  });
});
