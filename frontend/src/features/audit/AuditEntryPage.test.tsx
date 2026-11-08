import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  auditEntries,
  auditEntry,
  auditPageReply,
  changePageReply,
  contactChange,
  entryId,
  GROUP_ID,
  ok,
  renderAuditApp,
} from '../../test/auditApi';

// Stran enega vnosa, cilj povezav iz vnosa rollback in oznake Povrnjeno (FR-005-08, FR-005-12, FR-005-18).

const LIST = `/groups/${GROUP_ID}/audit`;
const ENTRY = entryId(5);
const PAGE = `${LIST}/${ENTRY}`;
const TARGET = auditEntry({
  id: ENTRY,
  createdAt: '2026-10-12T12:32:00Z',
  contactName: 'Janez Novak',
});

function renderEntry(options: Parameters<typeof renderAuditApp>[1] = {}) {
  return renderAuditApp(PAGE, {
    role: 'VIEWER',
    ...options,
    handlers: {
      entry: () => ok(TARGET),
      changes: changePageReply([contactChange()]),
      ...options.handlers,
    },
  });
}

describe('AuditEntryPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-005-12: stran vnosa – naslov, naslov strani, čas, izvajalec, stavek, podrobnosti in povezava nazaj', async () => {
    const { api } = renderEntry();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Vnos revizijske sledi' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Vnos revizijske sledi – Projekt FERI – Kontakti');
    await screen.findByRole('group', { name: 'Podrobnosti' });
    const content = screen.getByRole('main');
    expect(content).toHaveTextContent('12. 10. 2026, 14.32');
    expect(content).toHaveTextContent('Ana Novak');
    expect(content).toHaveTextContent('dodal(a) kontakt Janez Novak');
    const main = within(content);
    expect(main.getByRole('group', { name: 'Podrobnosti' })).toBeInTheDocument();
    expect(main.getByRole('link', { name: 'Nazaj na revizijsko sled' })).toHaveAttribute(
      'href',
      LIST,
    );
    expect(api.of('GET', `/api/groups/${GROUP_ID}/audit/${ENTRY}`)).toHaveLength(1);
  });

  it('FR-005-12: na strani vnosa ni gumba za rollback, tudi za admina', async () => {
    renderEntry({ role: 'ADMIN' });

    await screen.findByRole('heading', { level: 2, name: 'Vnos revizijske sledi' });
    expect(
      screen.queryByRole('button', { name: 'Povrni skupino na to točko' }),
    ).not.toBeInTheDocument();
  });

  it('FR-005-12: povezava Revizijska sled v glavi ima aria-current', async () => {
    renderEntry();

    await screen.findByRole('heading', { level: 2, name: 'Vnos revizijske sledi' });
    expect(
      within(screen.getByRole('navigation', { name: 'Razdelki skupine' })).getByRole('link', {
        name: 'Revizijska sled',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('FR-005-12: vnos ROLLBACK v seznamu odpre ciljni vnos', async () => {
    const entries = [
      auditEntry({
        id: entryId(9),
        action: 'ROLLBACK',
        contactName: null,
        target: { entryId: ENTRY, createdAt: '2026-10-12T12:32:00Z' },
      }),
      ...auditEntries(2),
    ];
    const { user } = renderAuditApp(LIST, {
      role: 'VIEWER',
      handlers: {
        list: auditPageReply(entries),
        entry: () => ok(TARGET),
      },
    });
    const first = within(
      await screen.findByRole('list', { name: 'Vnosi revizijske sledi' }),
    ).getAllByRole('listitem')[0] as HTMLElement;

    await user.click(within(first).getByRole('link', { name: '12. 10. 2026, 14.32' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Vnos revizijske sledi' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe(PAGE);
  });

  it('FR-005-12: neobstoječ ali tuj vnos je »Te strani ni«', async () => {
    renderAuditApp(PAGE, { role: 'VIEWER', handlers: { entry: () => ({ status: 404 }) } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Vnos revizijske sledi' }),
    ).not.toBeInTheDocument();
  });

  it('FR-005-18: napaka nalaganja – trajno sporočilo; Poskusi znova ponovi zahtevek', async () => {
    let fail = true;
    const { user, api } = renderAuditApp(PAGE, {
      role: 'VIEWER',
      handlers: {
        entry: () => (fail ? { status: 500, body: { code: 'INTERNAL' } } : ok(TARGET)),
        changes: changePageReply([]),
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Vnosa ni bilo mogoče naložiti. Poskusi znova.');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Vnos revizijske sledi' }),
    ).toBeInTheDocument();
    expect(api.of('GET', `/api/groups/${GROUP_ID}/audit/${ENTRY}`)).toHaveLength(2);
  });

  it('FR-005-12: stran vnosa brez kršitev axe (sl in en)', async () => {
    const { container } = renderEntry();
    await screen.findByRole('heading', { level: 2, name: 'Vnos revizijske sledi' });
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    await screen.findByRole('heading', { level: 2, name: 'Audit trail entry' });
    expect((await axe(container)).violations).toEqual([]);
  });
});
