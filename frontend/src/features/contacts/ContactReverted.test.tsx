import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { entryId, ok } from '../../test/auditApi';
import {
  CONTACT_ID,
  contactDetail,
  contactPageReply,
  contactSummary,
  GROUP_ID,
  renderContactsApp,
} from '../../test/contactsApi';
import { setViewport } from '../../test/viewport';
import type { RevertInfo } from './types';

// Povezava na sled kontakta (FR-005-09) in odsotnost oznake »Povrnjeno« na kartici (FR-020-20, popravek FR-005-19).

const LIST = `/groups/${GROUP_ID}/contacts`;
const VIEW = `${LIST}/${CONTACT_ID}`;
const TARGET_AT = '2026-10-12T12:32:00Z';
const ROLLED_BACK_AT = '2026-11-08T09:05:00Z';

const REVERTED: RevertInfo = {
  rollbackEntryId: entryId(9),
  rolledBackAt: ROLLED_BACK_AT,
  rolledBackBy: { name: 'Ana Novak', email: 'ana@primer.si' },
  targetEntryId: entryId(2),
  targetAt: TARGET_AT,
  targetInitial: false,
};

function renderView(
  detail = contactDetail({ reverted: REVERTED }),
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' = 'VIEWER',
) {
  return renderContactsApp(VIEW, {
    role,
    contacts: {
      get: () => ok(detail),
      list: contactPageReply([contactSummary(1)]),
    },
  });
}

describe('ContactReverted', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it.each([
    ['pod 1280 px', 'narrow'],
    ['pri 1280 px in več', 'panel'],
  ] as const)(
    'FR-005-09: pogled kontakta (%s) ima povezavo na sled kontakta – bralec tudi',
    async (_label, width) => {
      setViewport(width);
      renderView(contactDetail(), 'VIEWER');

      const link = await screen.findByRole('link', {
        name: 'Spremembe tega kontakta v revizijski sledi',
      });
      expect(link).toHaveAttribute('href', `/groups/${GROUP_ID}/audit?contact=${CONTACT_ID}`);
    },
  );

  it('FR-020-20: kartica kontakta po rollbacku ali obnovi nima značke ali opombe »Povrnjeno«', async () => {
    renderView();

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(screen.queryByRole('group', { name: 'Povrnjeno' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Povrnjeno|Povrnil/)).not.toBeInTheDocument();
    // Podatek je viden prek sledi in zgodovine kontakta.
    expect(screen.getByRole('link', { name: 'Zgodovina kontakta' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`,
    );
  });

  it('FR-020-20: kartica v angleščini je enaka – brez značke »Restored«', async () => {
    await i18n.changeLanguage('en');
    renderView();

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(screen.queryByRole('group', { name: 'Restored' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Restored/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Changes to this contact in the audit trail' }),
    ).toBeInTheDocument();
  });

  it('FR-020-20: v seznamu vrstica z reverted = true nima besedila »Povrnjeno«', async () => {
    renderContactsApp(LIST, {
      role: 'VIEWER',
      contacts: {
        list: contactPageReply([
          contactSummary(1, { reverted: true }),
          contactSummary(2, { reverted: false }),
        ]),
      },
    });

    const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(table).not.toHaveTextContent('Povrnjeno');
  });

  it('FR-020-20: kartica kontakta z rollbackom brez kršitev axe', async () => {
    const { container } = renderView();
    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });

    expect((await axe(container)).violations).toEqual([]);
  });
});
