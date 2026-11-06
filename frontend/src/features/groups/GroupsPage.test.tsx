import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { listReply, renderGroupsApp, summary } from '../../test/groupsApi';

// Zaslon *Skupine* (FR-002-04, -05, -09, -13; plan.md – Pages and routes, Key elements; design.md 8.15, 9.2).

const BY_ROLE = {
  OWNER: [
    summary(1, { title: 'Alfa', description: 'Prvi opis' }),
    summary(2, { title: 'Beta', color: 'mah' }),
  ],
  ADMIN: [summary(3, { title: 'Cvet' })],
  VIEWER: [summary(4, { title: 'Delta' })],
};

const pageRequests = (api: ReturnType<typeof renderGroupsApp>['api']) =>
  api.of('GET', '/api/groups').filter((r) => r.search.get('size') === '25');

describe('GroupsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-002-04: razdelki po vlogi v vrstnem redu Lastnik, Admin, Bralec s številom; razdelka Urednik ni', async () => {
    renderGroupsApp('/', { list: listReply(BY_ROLE) });

    const main = await screen.findByRole('main');
    expect(
      await within(main).findByRole('heading', { level: 1, name: 'Skupine' }),
    ).toBeInTheDocument();
    await within(main).findByRole('heading', { level: 2, name: 'Lastnik (2)' });
    expect(
      within(main)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Lastnik (2)', 'Admin (1)', 'Bralec (1)']);
    expect(within(main).queryByRole('heading', { name: /Urednik/ })).not.toBeInTheDocument();
  });

  it('FR-002-04: vrstica ima povezavo z naslovom, opis in število kontaktov', async () => {
    renderGroupsApp('/', { list: listReply(BY_ROLE) });

    const main = await screen.findByRole('main');
    const link = await within(main).findByRole('link', { name: 'Alfa' });
    expect(link).toHaveAttribute('href', `/groups/${BY_ROLE.OWNER[0]?.id}`);
    const row = within(main)
      .getAllByRole('listitem')
      .find((item) => within(item).queryByRole('link', { name: 'Alfa' }));
    expect(row).toHaveTextContent('Prvi opis');
    expect(row).toHaveTextContent('0 kontaktov');
    expect(within(main).getAllByRole('listitem')).toHaveLength(4);
  });

  it('FR-002-04: zahtevek nosi jezik vmesnika; ob menjavi jezika se ponovi', async () => {
    const { api } = renderGroupsApp('/', { list: listReply(BY_ROLE) });
    await screen.findByRole('heading', { level: 2, name: 'Lastnik (2)' });
    expect(pageRequests(api)[0]?.search.get('lang')).toBe('sl');

    await i18n.changeLanguage('en');

    expect(await screen.findByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
    await waitFor(() => expect(pageRequests(api).at(-1)?.search.get('lang')).toBe('en'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Owner (2)' })).toBeInTheDocument();
  });

  it('FR-002-05: brez skupin – prazno stanje z eno kontrolo Nova skupina', async () => {
    renderGroupsApp('/', { list: listReply({}) });

    const main = await screen.findByRole('main');
    // Prazno stanje: naslov ravni 2 in naslednji korak (plan.md – Key elements, design.md 8.15).
    expect(
      await within(main).findByRole('heading', { level: 2, name: 'Nimaš še nobene skupine.' }),
    ).toBeInTheDocument();
    expect(within(main).getAllByRole('button', { name: 'Nova skupina' })).toHaveLength(1);
    expect(
      within(main).queryByRole('heading', { level: 2, name: /\(\d+\)$/ }),
    ).not.toBeInTheDocument();
  });

  it('FR-002-04: med počasnim nalaganjem je prikazano »Nalagam…« in seznam je zaseden', async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderGroupsApp('/', {
      list: async (url) => {
        if (url.searchParams.get('size') === '25') await pending;
        return listReply(BY_ROLE)(url);
      },
    });

    // Nalagalnik se pokaže šele po 300 ms (design.md 8.15).
    const main = await screen.findByRole('main');
    const status = await within(main).findByRole('status', {}, { timeout: 2000 });
    expect(status).toHaveTextContent('Nalagam…');
    expect(within(main).getByRole('list', { busy: true })).toHaveAttribute('aria-busy', 'true');

    release();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Lastnik (2)' }),
    ).toBeInTheDocument();
  });

  it('FR-002-13: napaka nalaganja – sporočilo in Poskusi znova ponovi zahtevek', async () => {
    let failing = true;
    const { user, api } = renderGroupsApp('/', {
      list: (url) =>
        failing && url.searchParams.get('size') === '25'
          ? { status: 500, body: { code: 'INTERNAL' } }
          : listReply(BY_ROLE)(url),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Skupin ni bilo mogoče naložiti. Poskusi znova.');
    expect(alert.textContent).not.toMatch(/INTERNAL|500/);
    const before = pageRequests(api).length;
    failing = false;

    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Lastnik (2)' }),
    ).toBeInTheDocument();
    expect(pageRequests(api).length).toBeGreaterThan(before);
  });

  it('FR-002-09: naslov strani je »Skupine – Kontakti« / "Groups – Contacts"', async () => {
    renderGroupsApp('/', { list: listReply(BY_ROLE) });

    await screen.findByRole('heading', { level: 1, name: 'Skupine' });
    expect(document.title).toBe('Skupine – Kontakti');

    await i18n.changeLanguage('en');
    await screen.findByRole('heading', { level: 1, name: 'Groups' });
    expect(document.title).toBe('Groups – Contacts');
  });

  it.each([
    ['sl', 'polno'],
    ['en', 'polno'],
    ['sl', 'prazno'],
    ['en', 'prazno'],
    ['sl', 'napaka'],
    ['en', 'napaka'],
  ] as const)(
    'FR-002-04 FR-002-05: zaslon Skupine nima kršitev axe (%s, %s)',
    async (language, state) => {
      await i18n.changeLanguage(language);
      const { container } = renderGroupsApp('/', {
        list:
          state === 'napaka'
            ? (url) =>
                url.searchParams.get('size') === '25'
                  ? { status: 500, body: { code: 'INTERNAL' } }
                  : listReply({})(url)
            : listReply(state === 'polno' ? BY_ROLE : {}),
      });
      const heading = language === 'sl' ? 'Skupine' : 'Groups';
      await screen.findByRole('heading', { level: 1, name: heading });
      if (state === 'polno') await screen.findAllByRole('link', { name: 'Alfa' });
      if (state === 'napaka') await screen.findByRole('alert');
      if (state === 'prazno') {
        await screen.findByRole('heading', {
          level: 2,
          name: language === 'sl' ? 'Nimaš še nobene skupine.' : "You don't have any groups yet.",
        });
      }

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
