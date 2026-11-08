import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  auditEntries,
  auditEntry,
  auditPageReply,
  entryId,
  formatAuditTime,
  GROUP_ID,
  renderAuditApp,
} from '../../test/auditApi';

// Seznam vnosov revizijske sledi (FR-005-03, -07, -10, -18; plan.md – Key elements; design.md 8.9, 8.15, 9.3, §11).

const PATH = `/groups/${GROUP_ID}/audit`;
const LIST_API = `/api/groups/${GROUP_ID}/audit`;

const entriesList = () => screen.findByRole('list', { name: 'Vnosi revizijske sledi' });

/** Vnos (`listitem`) po besedilu stavka. */
async function itemWith(text: string) {
  const list = await entriesList();
  const match = within(list)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(text));
  if (!match) throw new Error(`vnos s stavkom »${text}« ne obstaja`);
  return match;
}

describe('AuditPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-005-07: bralec odpre razdelek – povezava v glavi, naslov, naslov strani, 25 vnosov, najnovejši zgoraj', async () => {
    const { api } = renderAuditApp(PATH, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(auditEntries(40)) },
    });

    const list = await entriesList();
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(25);
    expect(items[0]).toHaveTextContent('Kontakt 040');
    expect(items[24]).toHaveTextContent('Kontakt 016');
    const sections = within(screen.getByRole('navigation', { name: 'Razdelki skupine' }));
    const links = sections.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(['Kontakti', 'Revizijska sled', 'Nastavitve']);
    expect(sections.getByRole('link', { name: 'Revizijska sled' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Revizijska sled' })).toBeInTheDocument();
    expect(document.title).toBe('Revizijska sled – Projekt FERI – Kontakti');
    expect(api.of('GET', LIST_API)[0]?.search.toString()).toBe('page=0&size=25');
  });

  it('FR-005-07: naslov strani in povezava v glavi tudi v angleščini', async () => {
    await i18n.changeLanguage('en');
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(auditEntries(3)) } });

    await screen.findByRole('list', { name: 'Audit trail entries' });
    expect(document.title).toBe('Audit trail – Projekt FERI – Contacts');
    expect(
      within(screen.getByRole('navigation', { name: 'Group sections' })).getByRole('link', {
        name: 'Audit trail',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('FR-005-07: čas vnosa je v zapisu design.md §11 – dobesedni nizi v obeh jezikih (D-47)', async () => {
    const entries = [
      auditEntry({ id: entryId(2), createdAt: '2026-10-12T12:32:00Z' }),
      auditEntry({ id: entryId(1), createdAt: '2026-03-05T07:05:00Z' }),
    ];
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(entries) } });

    const list = await entriesList();
    const times = within(list).getAllByRole('listitem');
    expect(times[0]).toHaveTextContent('12. 10. 2026, 14.32');
    expect(times[1]).toHaveTextContent('5. 3. 2026, 8.05');
    expect(formatAuditTime('2026-10-12T12:32:00Z', 'sl')).toBe('12. 10. 2026, 14.32');
  });

  it('FR-005-07: angleški zapis časa je "12 Oct 2026, 14:32"', async () => {
    await i18n.changeLanguage('en');
    const entries = [
      auditEntry({ id: entryId(2), createdAt: '2026-10-12T12:32:00Z' }),
      auditEntry({ id: entryId(1), createdAt: '2026-03-05T07:05:00Z' }),
    ];
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(entries) } });

    const list = await screen.findByRole('list', { name: 'Audit trail entries' });
    const times = within(list).getAllByRole('listitem');
    expect(times[0]).toHaveTextContent('12 Oct 2026, 14:32');
    expect(times[1]).toHaveTextContent('5 Mar 2026, 08:05');
    expect(formatAuditTime('2026-03-05T07:05:00Z', 'en')).toBe('5 Mar 2026, 08:05');
  });

  it('FR-005-03: izvajalec in stavek dejanja po vrsti, številu kontaktov in množini', async () => {
    const actor = { name: 'Ana Novak', email: 'ana@primer.si' };
    const entries = [
      auditEntry({
        id: entryId(10),
        action: 'ROLLBACK',
        contactCount: 4,
        contactName: null,
        targetInitial: true,
      }),
      auditEntry({
        id: entryId(9),
        action: 'ROLLBACK',
        contactCount: 1,
        contactName: null,
        target: { entryId: entryId(1), createdAt: '2026-10-12T12:32:00Z' },
      }),
      auditEntry({ id: entryId(8), action: 'MERGE', contactCount: 2, contactName: null }),
      auditEntry({ id: entryId(7), action: 'DELETE', contactCount: 5, contactName: null }),
      auditEntry({ id: entryId(6), action: 'DELETE', contactCount: 3, contactName: null }),
      auditEntry({ id: entryId(5), action: 'DELETE', contactCount: 2, contactName: null }),
      auditEntry({ id: entryId(4), action: 'UPDATE', contactCount: 12, contactName: null }),
      auditEntry({ id: entryId(3), action: 'UPDATE', contactCount: 1, contactName: 'Janez Novak' }),
      auditEntry({ id: entryId(2), action: 'CREATE', actor: null }),
      auditEntry({
        id: entryId(1),
        action: 'CREATE',
        actor: { name: null, email: 'brez@primer.si' },
      }),
    ];
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(entries) } });

    const list = await entriesList();
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(`${actor.name} povrnil(a) skupino na začetno stanje`);
    expect(items[1]).toHaveTextContent('povrnil(a) skupino na stanje 12. 10. 2026, 14.32');
    expect(items[2]).toHaveTextContent('združil(a) 2 kontakta');
    expect(items[3]).toHaveTextContent('izbrisal(a) 5 kontaktov');
    expect(items[4]).toHaveTextContent('izbrisal(a) 3 kontakte');
    expect(items[5]).toHaveTextContent('izbrisal(a) 2 kontakta');
    expect(items[6]).toHaveTextContent('uredil(a) 12 kontaktov');
    expect(items[7]).toHaveTextContent('uredil(a) kontakt Janez Novak');
    expect(items[8]).toHaveTextContent('izbrisan uporabnik dodal(a) kontakt Janez Novak');
    expect(items[9]).toHaveTextContent('brez@primer.si dodal(a) kontakt Janez Novak');
  });

  it('FR-005-03: stavki v angleščini', async () => {
    await i18n.changeLanguage('en');
    const entries = [
      auditEntry({ id: entryId(3), action: 'UPDATE', contactCount: 12, contactName: null }),
      auditEntry({ id: entryId(2), action: 'CREATE', contactCount: 1 }),
      auditEntry({ id: entryId(1), action: 'ROLLBACK', contactName: null, targetInitial: true }),
    ];
    renderAuditApp(PATH, { role: 'VIEWER', handlers: { list: auditPageReply(entries) } });

    const list = await screen.findByRole('list', { name: 'Audit trail entries' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('edited 12 contacts');
    expect(items[1]).toHaveTextContent('added contact Janez Novak');
    expect(items[2]).toHaveTextContent('restored the group to the initial state');
  });

  it('FR-005-07: paginacija – obseg, Naslednja gre na ?page=2 in zahteva page=1, velikost strani 50', async () => {
    const { user, api } = renderAuditApp(PATH, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(auditEntries(120)) },
    });
    await entriesList();

    const nav = screen.getByRole('navigation', { name: 'Strani rezultatov' });
    expect(within(nav).getByRole('status')).toHaveTextContent('1–25 od 120');
    await user.click(within(nav).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() => expect(window.location.search).toBe('?page=2'));
    expect(api.of('GET', LIST_API).at(-1)?.search.toString()).toBe('page=1&size=25');
    await user.selectOptions(within(nav).getByRole('combobox', { name: 'Velikost strani' }), '50');
    await waitFor(() => expect(window.location.search).toContain('size=50'));
    expect(api.of('GET', LIST_API).at(-1)?.search.get('size')).toBe('50');
  });

  it('FR-005-07: osvežitev ohrani stran (izris na ?page=3)', async () => {
    const { api } = renderAuditApp(`${PATH}?page=3`, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(auditEntries(120)) },
    });

    await entriesList();
    expect(api.of('GET', LIST_API)[0]?.search.toString()).toBe('page=2&size=25');
    expect(
      within(screen.getByRole('navigation', { name: 'Strani rezultatov' })).getByRole('status'),
    ).toHaveTextContent('51–75 od 120');
  });

  it('FR-005-07: po menjavi strani je fokus na naslovu razdelka', async () => {
    const { user } = renderAuditApp(PATH, {
      role: 'VIEWER',
      handlers: { list: auditPageReply(auditEntries(60)) },
    });
    await entriesList();

    await user.click(screen.getByRole('button', { name: 'Naslednja' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Revizijska sled' })).toHaveFocus(),
    );
  });

  it('FR-005-10: prazna sled – naslov stopnje 3', async () => {
    renderAuditApp(PATH, { role: 'VIEWER' });

    expect(
      await screen.findByRole('heading', { level: 3, name: 'V revizijski sledi še ni vnosov.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Vnosi revizijske sledi' })).not.toBeInTheDocument();
  });

  it('FR-005-07: arhivirana skupina – sled je berljiva', async () => {
    renderAuditApp(PATH, {
      role: 'ADMIN',
      archived: true,
      handlers: { list: auditPageReply(auditEntries(3)) },
    });

    const list = await entriesList();
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  });

  it('FR-005-07: med nalaganjem je status »Nalagam…«', async () => {
    renderAuditApp(PATH, {
      role: 'VIEWER',
      handlers: { list: () => new Promise(() => undefined) },
    });

    await screen.findByRole('heading', { level: 1, name: 'Projekt FERI' });
    expect(await within(screen.getByRole('main')).findByRole('status')).toHaveTextContent(
      'Nalagam…',
    );
  });

  it('FR-005-18: napaka nalaganja je trajno sporočilo; Poskusi znova ponovi zahtevek', async () => {
    let fail = true;
    const { user, api } = renderAuditApp(PATH, {
      role: 'VIEWER',
      handlers: {
        list: (url) =>
          fail ? { status: 500, body: { code: 'INTERNAL' } } : auditPageReply(auditEntries(2))(url),
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Revizijske sledi ni bilo mogoče naložiti. Poskusi znova.');
    expect(alert).not.toHaveTextContent('INTERNAL');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(await entriesList()).toBeInTheDocument();
    expect(api.of('GET', LIST_API)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-005-07: nečlan ali neobstoječa skupina – »Te strani ni« brez podatkov sledi', async () => {
    renderAuditApp(PATH, {
      groups: { get: () => ({ status: 404 }) },
      handlers: { list: auditPageReply(auditEntries(3)) },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Vnosi revizijske sledi' })).not.toBeInTheDocument();
  });

  it('FR-005-07: seznam brez kršitev axe (sl in en)', async () => {
    const { container } = renderAuditApp(PATH, {
      role: 'ADMIN',
      handlers: { list: auditPageReply(auditEntries(30)) },
    });
    await entriesList();
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    await screen.findByRole('list', { name: 'Audit trail entries' });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-005-03: vnos ROLLBACK ima povezavo na ciljni vnos', async () => {
    renderAuditApp(PATH, {
      role: 'VIEWER',
      handlers: {
        list: auditPageReply([
          auditEntry({
            id: entryId(2),
            action: 'ROLLBACK',
            contactName: null,
            target: { entryId: entryId(1), createdAt: '2026-10-12T12:32:00Z' },
          }),
          auditEntry({ id: entryId(1), createdAt: '2026-10-12T12:32:00Z' }),
        ]),
      },
    });

    const item = await itemWith('povrnil(a) skupino na stanje');
    expect(within(item).getByRole('link', { name: '12. 10. 2026, 14.32' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/audit/${entryId(1)}`,
    );
  });
});
