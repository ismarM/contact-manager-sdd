import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import {
  archivedReply,
  archivedSummary,
  listReply,
  renderGroupsApp,
  summaries,
} from '../../test/groupsApi';
import { server } from '../../test/msw';
import { navNames } from '../../test/names';
import { currentLocation } from '../../test/renderApp';
import { setViewport } from '../../test/viewport';

// Števci navigacije iz obstoječih endpointov (FR-020-05, research R-06).

describe('useNavCounts', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('wide');
  });

  it('FR-020-05: tri neodvisni klici – skupine in arhivirane z size=1, število povabil', async () => {
    const invitationRequests: string[] = [];
    server.use(
      http.get('/api/invitations/count', ({ request }) => {
        invitationRequests.push(new URL(request.url).pathname);
        return HttpResponse.json({ count: 4 });
      }),
    );
    const { api } = renderGroupsApp('/', {
      list: listReply({ OWNER: summaries(5) }),
      listArchived: archivedReply([archivedSummary(1)]),
    });

    const nav = await screen.findByRole('navigation', { name: 'Glavna navigacija' });
    await waitFor(() =>
      expect(
        within(nav).getByRole('link', { name: navNames.groups() }),
      ).toHaveAccessibleDescription('5'),
    );
    await waitFor(() =>
      expect(
        within(nav).getByRole('link', { name: navNames.archived() }),
      ).toHaveAccessibleDescription('1'),
    );
    await within(nav).findByRole('link', { name: navNames.invitationsNew(4) });
    expect(api.of('GET', '/api/groups').some((r) => r.search.get('size') === '1')).toBe(true);
    expect(api.of('GET', '/api/groups/archived').some((r) => r.search.get('size') === '1')).toBe(
      true,
    );
    expect(invitationRequests.length).toBeGreaterThan(0);
  });

  it('FR-020-05: ob napaki ni števca, navigacija ostane uporabna', async () => {
    server.use(http.get('/api/invitations/count', () => HttpResponse.json({}, { status: 500 })));
    renderGroupsApp('/', {
      list: () => ({ status: 500, body: { code: 'INTERNAL' } }),
      listArchived: () => 'network-error',
    });

    const nav = await screen.findByRole('navigation', { name: 'Glavna navigacija' });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Kontakti' })).toBeVisible());
    expect(within(nav).getByRole('link', { name: navNames.groups() })).toHaveAccessibleDescription(
      '',
    );
    expect(
      within(nav).getByRole('link', { name: navNames.archived() }),
    ).toHaveAccessibleDescription('');
    expect(within(nav).getByRole('link', { name: navNames.invitations() })).toHaveAttribute(
      'href',
      '/invitations',
    );
  });

  it('FR-020-05: odgovor 401 števca konča sejo (prijava)', async () => {
    renderGroupsApp('/', {
      listArchived: () => ({ status: 401, body: { code: 'UNAUTHENTICATED' } }),
    });

    await waitFor(() => expect(currentLocation()).toMatch(/^\/login/));
  });
});
