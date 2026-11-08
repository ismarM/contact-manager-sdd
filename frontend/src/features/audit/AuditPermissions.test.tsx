import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { auditEntries, auditPageReply, GROUP_ID, renderAuditApp } from '../../test/auditApi';

// Gumb za rollback samo za ADMIN in OWNER v nearhivirani skupini (FR-005-17; design.md 5, 9.6).

const PATH = `/groups/${GROUP_ID}/audit`;
const BUTTON = 'Povrni skupino na to točko';

function render(role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER', archived: boolean) {
  return renderAuditApp(PATH, {
    role,
    archived,
    handlers: { list: auditPageReply(auditEntries(4)) },
  });
}

describe('AuditPermissions', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it.each(['VIEWER', 'EDITOR'] as const)(
    'FR-005-17: %s nearhivirane skupine vidi sled in podrobnosti, a nobenega gumba za rollback (tudi ne pri Začetnem stanju)',
    async (role) => {
      render(role, false);

      const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
      const items = within(list).getAllByRole('listitem');
      expect(items.length).toBeGreaterThanOrEqual(5);
      expect(items.at(-1)).toHaveTextContent('Začetno stanje');
      expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument();
      expect(
        within(items[0] as HTMLElement).getByRole('group', { name: 'Podrobnosti' }),
      ).toBeVisible();
    },
  );

  it.each(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const)(
    'FR-005-17: %s arhivirane skupine nima gumba za rollback, sled je berljiva',
    async (role) => {
      render(role, true);

      const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
      expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
      expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument();
    },
  );

  it.each(['OWNER', 'ADMIN'] as const)(
    'FR-005-17: %s nearhivirane skupine vidi gumbe za rollback (razen pri najnovejšem vnosu)',
    async (role) => {
      render(role, false);

      const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
      const items = within(list).getAllByRole('listitem');
      expect(within(items[0] as HTMLElement).queryByRole('button', { name: BUTTON })).toBeNull();
      expect(within(items[1] as HTMLElement).getByRole('button', { name: BUTTON })).toBeVisible();
      expect(
        within(items.at(-1) as HTMLElement).getByRole('button', { name: BUTTON }),
      ).toBeVisible();
    },
  );

  it('FR-005-17: vloga se vzame iz GET /api/groups/{id}', async () => {
    const { groupsApi } = render('VIEWER', false);

    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    expect(
      groupsApi.requests.filter((r) => r.method === 'GET' && r.path === `/api/groups/${GROUP_ID}`),
    ).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument();
  });

  it('FR-005-17: brez gumbov za rollback brez kršitev axe', async () => {
    const { container } = render('VIEWER', false);
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

    expect((await axe(container)).violations).toEqual([]);
  });
});
