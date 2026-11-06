import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { listReply, renderGroupsApp, summaries } from '../../test/groupsApi';

// Paginacija razdelka na zaslonu *Skupine* (FR-002-04; design.md 8.9, D-26; plan.md – Key elements).

const pageRequests = (api: ReturnType<typeof renderGroupsApp>['api'], role: string) =>
  api
    .of('GET', '/api/groups')
    .filter((r) => r.search.get('role') === role && r.search.get('size') !== '10');

const groupLinks = (container: HTMLElement) =>
  within(container).queryAllByRole('link', { name: /^Skupina \d{3}$/ });

describe('GroupSection – paginacija', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-002-04: 30 skupin – prva stran 25, Naslednja prikaže preostalih 5 in premakne fokus na naslov razdelka', async () => {
    const { user, api } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(30) }) });
    const main = await screen.findByRole('main');
    const pages = await within(main).findByRole('navigation', {
      name: 'Strani rezultatov: Lastnik',
    });

    expect(groupLinks(main)).toHaveLength(25);
    expect(within(pages).getByRole('status')).toHaveTextContent('1–25 od 30');
    expect(pages).toHaveTextContent('Stran 1 od 2');
    expect(within(pages).getByRole('button', { name: 'Prejšnja' })).toBeDisabled();

    await user.click(within(pages).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() => expect(groupLinks(main)).toHaveLength(5));
    const request = pageRequests(api, 'OWNER').at(-1);
    expect(request?.search.get('page')).toBe('1');
    expect(request?.search.get('size')).toBe('25');
    expect(within(pages).getByRole('status')).toHaveTextContent('26–30 od 30');
    expect(pages).toHaveTextContent('Stran 2 od 2');
    expect(within(pages).getByRole('button', { name: 'Naslednja' })).toBeDisabled();
    expect(within(main).getByRole('heading', { level: 2, name: 'Lastnik (30)' })).toHaveFocus();
  });

  it('FR-002-04: Velikost strani 50 zahteva size=50 od prve strani', async () => {
    const { user, api } = renderGroupsApp('/', { list: listReply({ OWNER: summaries(60) }) });
    const main = await screen.findByRole('main');
    const pages = await within(main).findByRole('navigation', {
      name: 'Strani rezultatov: Lastnik',
    });
    const pageSize = within(pages).getByRole('combobox', { name: 'Velikost strani' });
    expect(
      within(pageSize)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['25', '50', '100']);

    await user.selectOptions(pageSize, '50');

    await waitFor(() => expect(groupLinks(main)).toHaveLength(50));
    const request = pageRequests(api, 'OWNER').at(-1);
    expect(request?.search.get('size')).toBe('50');
    expect(request?.search.get('page')).toBe('0');
    expect(within(pages).getByRole('status')).toHaveTextContent('1–50 od 60');
  });

  it('FR-002-04: razdelek z največ 25 skupinami nima paginacije', async () => {
    renderGroupsApp('/', { list: listReply({ OWNER: summaries(25) }) });
    const main = await screen.findByRole('main');

    await within(main).findByRole('heading', { level: 2, name: 'Lastnik (25)' });

    expect(within(main).queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('FR-002-04: dva paginirana razdelka imata različno ime in ločeno stanje strani', async () => {
    const { user } = renderGroupsApp('/', {
      list: listReply({ OWNER: summaries(30), VIEWER: summaries(40, 100) }),
    });
    const main = await screen.findByRole('main');
    const owner = await within(main).findByRole('navigation', {
      name: 'Strani rezultatov: Lastnik',
    });
    const viewer = within(main).getByRole('navigation', { name: 'Strani rezultatov: Bralec' });

    await user.click(within(owner).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() => expect(within(owner).getByRole('status')).toHaveTextContent('26–30 od 30'));
    expect(within(viewer).getByRole('status')).toHaveTextContent('1–25 od 40');
  });

  it.each(['sl', 'en'] as const)(
    'FR-002-04: paginacija nima kršitev axe (%s)',
    async (language) => {
      await i18n.changeLanguage(language);
      const { container } = renderGroupsApp('/', {
        list: listReply({ OWNER: summaries(30), VIEWER: summaries(40, 100) }),
      });
      const main = await screen.findByRole('main');
      const owner = language === 'sl' ? 'Strani rezultatov: Lastnik' : 'Result pages: Owner';
      const pages = await within(main).findByRole('navigation', { name: owner });
      if (language === 'en') {
        expect(within(pages).getByRole('combobox', { name: 'Page size' })).toBeInTheDocument();
        expect(
          within(main).getByRole('navigation', { name: 'Result pages: Viewer' }),
        ).toBeInTheDocument();
      }

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
