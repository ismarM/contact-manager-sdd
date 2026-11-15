import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  auditEntry,
  auditPageReply,
  entryId,
  formatAuditTime,
  GROUP_ID,
  renderAuditApp,
} from '../../test/auditApi';
import { tr } from '../../test/historyApi';

// Neznana vrsta dejanja in vrsta RESTORE v sledi (FR-015-12, FR-015-18; research R-09).

const PATH = `/groups/${GROUP_ID}/audit`;

const TARGET = { entryId: entryId(1), createdAt: '2026-10-12T12:32:00Z' };
const ENTRIES = [
  auditEntry({ id: entryId(5), action: 'IMPORT', contactCount: 1000, contactName: null }),
  auditEntry({ id: entryId(4), action: 'IMPORT', contactCount: 1, contactName: 'Janez Novak' }),
  auditEntry({
    id: entryId(3),
    action: 'RESTORE',
    contactCount: 1,
    contactName: 'Janez Novak',
    target: TARGET,
  }),
  auditEntry({
    id: entryId(2),
    action: 'RESTORE',
    contactCount: 1,
    contactName: 'Janez Novak',
    targetInitial: true,
  }),
  auditEntry({ id: entryId(1), action: 'UPDATE' }),
];

describe('AuditUnknownAction', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-18: neznana vrsta (IMPORT) je splošen stavek, brez napake; RESTORE ima svoj stavek s povezavo na različico', async () => {
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(ENTRIES) } });

    const items = within(
      await screen.findByRole('list', { name: tr('audit.list.entries') }),
    ).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ana Novak spremenil(a) 1000 kontaktov');
    expect(items[1]).toHaveTextContent('Ana Novak spremenil(a) kontakt Janez Novak');
    expect(items[2]).toHaveTextContent(
      `Ana Novak obnovil(a) kontakt Janez Novak na stanje ${formatAuditTime(TARGET.createdAt, 'sl')}`,
    );
    expect(
      within(items[2] as HTMLElement).getByRole('link', {
        name: formatAuditTime(TARGET.createdAt, 'sl'),
      }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/audit/${TARGET.entryId}`);
    expect(items[3]).toHaveTextContent(
      'Ana Novak obnovil(a) kontakt Janez Novak na izhodiščno stanje',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-015-18: filter pozna vrsto obnova, neznana vrsta v poti se prezre', async () => {
    const { user, api } = renderAuditApp(`${PATH}?action=IMPORT&action=RESTORE`, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(ENTRIES) },
    });
    await screen.findByRole('list', { name: tr('audit.list.entries') });

    expect(api.of('GET', `/api/groups/${GROUP_ID}/audit`)[0]?.search.getAll('action')).toEqual([
      'RESTORE',
    ]);
    await user.click(screen.getByRole('button', { name: 'Filtri (1)' }));
    expect(
      screen.getByRole('checkbox', { name: tr('audit.filters.action.RESTORE') }),
    ).toBeChecked();
  });

  it('FR-015-18: sled z neznano vrsto in RESTORE brez kršitev axe (en)', async () => {
    await i18n.changeLanguage('en');
    const { container } = renderAuditApp(PATH, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(ENTRIES) },
    });

    const items = within(
      await screen.findByRole('list', { name: 'Audit trail entries' }),
    ).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ana Novak changed 1000 contacts');
    expect(items[2]).toHaveTextContent('restored contact Janez Novak to the state of');
    expect((await axe(container)).violations).toEqual([]);
  });
});
