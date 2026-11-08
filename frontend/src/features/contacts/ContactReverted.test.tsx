import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { entryId, formatAuditTime, ok, summaryOf } from '../../test/auditApi';
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

// Povezava na sled kontakta in oznaka »Povrnjeno« (FR-005-09, FR-005-19; design.md 8.5).
// Zadnja sprememba po rollbacku (updatedBy/updatedAt iz točke T) se v vmesniku pokaže v opozorilu o konfliktu 004
// (ContactConflict.test); tu se preverja oznaka sama.

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

  it('FR-005-19: kontakt z oznako ima skupino »Povrnjeno«, privzeto zaprto', async () => {
    renderView();

    const group = await screen.findByRole('group', { name: 'Povrnjeno' });
    expect(group).not.toHaveAttribute('open');
  });

  it('FR-005-19: razkritje oznake pokaže ciljno stanje, povezavo na vnos povrnitve in izvajalca', async () => {
    const { user } = renderView();
    const group = await screen.findByRole('group', { name: 'Povrnjeno' });

    await user.click(summaryOf(group));

    expect(group).toHaveTextContent(`Povrnjeno na stanje ${formatAuditTime(TARGET_AT, 'sl')}`);
    expect(
      within(group).getByRole('link', { name: formatAuditTime(TARGET_AT, 'sl') }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/audit/${entryId(2)}`);
    expect(within(group).getByRole('link', { name: 'Odpri vnos povrnitve' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/audit/${entryId(9)}`,
    );
    expect(group).toHaveTextContent('Povrnil(a): Ana Novak');
    expect(group).toHaveTextContent(formatAuditTime(ROLLED_BACK_AT, 'sl'));
  });

  it('FR-005-19: izvajalec rollbacka z izbrisanim računom je »izbrisan uporabnik«', async () => {
    const { user } = renderView(contactDetail({ reverted: { ...REVERTED, rolledBackBy: null } }));

    await user.click(summaryOf(await screen.findByRole('group', { name: 'Povrnjeno' })));

    expect(screen.getByRole('group', { name: 'Povrnjeno' })).toHaveTextContent(
      'Povrnil(a): izbrisan uporabnik',
    );
  });

  it('FR-005-20: povrnitev na začetno stanje – brez povezave na čas', async () => {
    const { user } = renderView(
      contactDetail({
        reverted: { ...REVERTED, targetEntryId: null, targetAt: null, targetInitial: true },
      }),
    );
    const group = await screen.findByRole('group', { name: 'Povrnjeno' });

    await user.click(summaryOf(group));

    expect(group).toHaveTextContent('Povrnjeno na začetno stanje');
    expect(within(group).getAllByRole('link')).toHaveLength(1);
    expect(within(group).getByRole('link', { name: 'Odpri vnos povrnitve' })).toBeInTheDocument();
  });

  it('FR-005-19: kontakt brez oznake (reverted null ali brez polja) nima skupine »Povrnjeno«', async () => {
    const withNull = renderView(contactDetail({ reverted: null }));
    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(screen.queryByRole('group', { name: 'Povrnjeno' })).not.toBeInTheDocument();
    withNull.unmount();

    renderView(contactDetail());
    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(screen.queryByRole('group', { name: 'Povrnjeno' })).not.toBeInTheDocument();
  });

  it('FR-005-19: v seznamu ima vrstica z reverted = true besedilo »Povrnjeno« v celici imena, druge ne', async () => {
    renderContactsApp(LIST, {
      role: 'VIEWER',
      contacts: {
        list: contactPageReply([
          contactSummary(1, { reverted: true }),
          contactSummary(2, { reverted: false }),
          contactSummary(3),
        ]),
      },
    });

    const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Povrnjeno');
    expect(rows[1]).not.toHaveTextContent('Povrnjeno');
    expect(rows[2]).not.toHaveTextContent('Povrnjeno');
    // Besedilo je ob povezavi, ne v njej.
    expect(
      within(rows[0] as HTMLElement).getByRole('link', { name: 'Ime001 Priimek001' }),
    ).not.toHaveTextContent('Povrnjeno');
  });

  it('FR-005-19: oznaka in povezava v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { user } = renderView();

    const group = await screen.findByRole('group', { name: 'Restored' });
    await user.click(summaryOf(group));

    expect(group).toHaveTextContent(`Restored to the state of ${formatAuditTime(TARGET_AT, 'en')}`);
    expect(within(group).getByRole('link', { name: 'Open the restore entry' })).toBeInTheDocument();
    expect(group).toHaveTextContent('Restored by: Ana Novak');
    expect(
      screen.getByRole('link', { name: 'Changes to this contact in the audit trail' }),
    ).toBeInTheDocument();
  });

  it('FR-005-19: pogled z odprto oznako brez kršitev axe', async () => {
    const { user, container } = renderView();
    await user.click(summaryOf(await screen.findByRole('group', { name: 'Povrnjeno' })));

    expect((await axe(container)).violations).toEqual([]);
  });
});
