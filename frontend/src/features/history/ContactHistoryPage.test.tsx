import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { summaryOf } from '../../test/auditApi';
import {
  CONTACT_ID,
  entryId,
  formatAuditTime,
  GROUP_ID,
  historyEvent,
  historyEvents,
  historyReply,
  renderHistoryApp,
  tr,
} from '../../test/historyApi';

// Zgodovina kontakta (FR-005-05 … -07, -18, -19; design.md 9.6, 8.9, 8.15).

const PATH = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`;
const API = `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`;
const OTHER_ID = '0193c4a2-7a1f-7c3e-9b1a-c0ffee0000aa';

const timeline = () => screen.findByRole('list', { name: tr('history.page.events') });

async function eventItem(text: string) {
  const list = await timeline();
  const match = within(list)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(text));
  if (!match) throw new Error(`dogodek »${text}« ne obstaja`);
  return match;
}

function render(
  events = historyEvents(3),
  contact: Parameters<typeof historyReply>[1] = {},
  options: { role?: 'OWNER' | 'EDITOR' | 'VIEWER'; path?: string } = {},
) {
  return renderHistoryApp(options.path ?? PATH, {
    role: options.role ?? 'VIEWER',
    history: { history: historyReply(events, contact) },
  });
}

describe('ContactHistoryPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-05: časovnica ima najnovejši dogodek zgoraj, z izvajalcem, časom, stavkom in vrsto spremembe', async () => {
    const events = [
      historyEvent(3, {
        action: 'UPDATE',
        actor: { name: 'Boris Kranjc', email: 'boris@primer.si' },
      }),
      historyEvent(2, { action: 'UPDATE', fields: [] }),
      historyEvent(1, {
        action: 'CREATE',
        kind: 'ADDED',
        actor: null,
        fields: [{ field: 'FIRST_NAME', key: null, before: null, after: 'Janez' }],
      }),
    ];
    const { history } = render(events);

    const items = within(await timeline()).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Boris Kranjc uredil(a) kontakt');
    expect(items[0]).toHaveTextContent(formatAuditTime(events[0]?.createdAt ?? '', 'sl'));
    expect(items[0]).toHaveTextContent(tr('history.kind.CHANGED'));
    expect(items[0]).toHaveTextContent(`Spremenjena polja: ${tr('audit.details.fields.PHONE')}`);
    expect(items[2]).toHaveTextContent(`${tr('audit.list.deletedUser')} dodal(a) kontakt`);
    expect(items[2]).toHaveTextContent(tr('history.kind.ADDED'));
    expect(history.of('GET', API)[0]?.search.toString()).toBe('page=0&size=25');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Zgodovina kontakta Janez Novak' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.title).toBe('Zgodovina kontakta: Janez Novak – Projekt FERI – Kontakti'),
    );
  });

  it('FR-015-06: Podrobnosti razkrijejo staro in novo vrednost samo spremenjenih polj', async () => {
    const { user } = render();
    const item = await eventItem('Ana Novak');

    const details = within(item).getByRole('group', { name: tr('history.event.details') });
    expect(within(item).queryByRole('table')).not.toBeInTheDocument();
    await user.click(summaryOf(details));

    const table = await within(item).findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent(`${tr('audit.details.fields.PHONE')}01 234 5678031 123 456`);
  });

  it('FR-015-06: dogodek množičnega vnosa ima povezavo na celoten vnos, dogodek enega kontakta je nima', async () => {
    render([
      historyEvent(2, { entryContactCount: 500, action: 'UPDATE' }),
      historyEvent(1, { entryContactCount: 1 }),
    ]);

    const items = within(await timeline()).getAllByRole('listitem');
    expect(
      within(items[0] as HTMLElement).getByRole('link', { name: tr('history.event.fullEntry') }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/audit/${entryId(2)}`);
    expect(
      within(items[1] as HTMLElement).queryByRole('link', { name: tr('history.event.fullEntry') }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-05: več kot 25 dogodkov – paginacija po skupnem slovarju, stran je v poti', async () => {
    const { user, history } = render(historyEvents(40));
    const items = within(await timeline()).getAllByRole('listitem');
    expect(items).toHaveLength(25);

    const nav = screen.getByRole('navigation', {
      name: tr('groups.pagination.label', { list: tr('history.page.list') }),
    });
    expect(nav).toHaveTextContent('1–25 od 40');
    await user.click(within(nav).getByRole('button', { name: tr('groups.pagination.next') }));

    await waitFor(() => expect(window.location.search).toBe('?page=2'));
    await waitFor(() => expect(history.of('GET', API).at(-1)?.search.get('page')).toBe('1'));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: tr('history.page.events') })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(15),
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();

    await user.selectOptions(
      screen.getByRole('combobox', { name: tr('groups.pagination.pageSize') }),
      '50',
    );
    await waitFor(() => expect(window.location.search).toBe('?size=50'));
  });

  it('FR-015-07: kontakt brez zabeleženih sprememb pokaže prazno stanje, ne napake', async () => {
    render([]);

    expect(
      await screen.findByRole('heading', { level: 3, name: tr('history.page.empty') }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: tr('history.page.events') })).not.toBeInTheDocument();
  });

  it('FR-015-07: izbrisan kontakt je označen, zadnji dogodek je odstranitev, povezava nazaj vodi na izbrisane', async () => {
    render(
      [
        historyEvent(2, { action: 'DELETE', kind: 'REMOVED', hasVersion: false, fields: [] }),
        historyEvent(1, { action: 'CREATE', kind: 'ADDED' }),
      ],
      { status: 'DELETED', version: null },
    );

    const items = within(await timeline()).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('izbrisal(a) kontakt');
    expect(items[0]).toHaveTextContent(tr('history.kind.REMOVED'));
    expect(screen.getByRole('note')).toHaveTextContent(tr('history.page.statusDeleted'));
    expect(screen.getByRole('link', { name: tr('history.page.backDeleted') })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/deleted-contacts`,
    );
    // Odstranitev nima različice: brez ogleda; ustvaritev ima.
    expect(
      within(items[0] as HTMLElement).queryByRole('link', {
        name: new RegExp(tr('history.event.viewVersion')),
      }),
    ).not.toBeInTheDocument();
    expect(
      within(items[1] as HTMLElement).getByRole('link', {
        name: new RegExp(tr('history.event.viewVersion')),
      }),
    ).toBeVisible();
  });

  it('FR-015-07: z združevanjem odstranjen kontakt – »združen v ‹ime›« s povezavo na zgodovino ohranjenega', async () => {
    render(
      [
        historyEvent(2, {
          action: 'MERGE',
          kind: 'REMOVED',
          hasVersion: false,
          entryContactCount: 2,
          mergedInto: { contactId: OTHER_ID, displayName: 'Janez Novak (ohranjen)' },
        }),
        historyEvent(1, { action: 'CREATE', kind: 'ADDED' }),
      ],
      { status: 'MERGED', version: null },
    );

    const first = within(await timeline()).getAllByRole('listitem')[0] as HTMLElement;
    expect(first).toHaveTextContent('združen v Janez Novak (ohranjen)');
    expect(within(first).getByRole('link', { name: 'Janez Novak (ohranjen)' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${OTHER_ID}/history`,
    );
    expect(screen.getByRole('note')).toHaveTextContent(tr('history.page.statusMerged'));
  });

  it('FR-015-07: ohranjeni kontakt ima dogodek »združil(a) ‹n› kontaktov«', async () => {
    render([historyEvent(2, { action: 'MERGE', entryContactCount: 3 })]);

    expect(await eventItem('Ana Novak')).toHaveTextContent('združil(a) 3 kontakte');
  });

  it('FR-015-12: dogodek obnove ima stavek in povezavo na obnovljeno različico', async () => {
    const target = { entryId: entryId(1), createdAt: '2026-10-12T12:01:00Z' };
    render([historyEvent(2, { action: 'RESTORE', target }), historyEvent(1)]);

    const first = within(await timeline()).getAllByRole('listitem')[0] as HTMLElement;
    expect(first).toHaveTextContent('obnovil(a) kontakt na stanje');
    expect(
      within(first).getByRole('link', { name: formatAuditTime(target.createdAt, 'sl') }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history/${entryId(1)}`);
  });

  it('FR-015-18: neznana vrsta dejanja (EXPORT; IMPORT je od 014 znana) je splošen stavek s poljih, brez napake', async () => {
    render([historyEvent(2, { action: 'EXPORT', entryContactCount: 1000 })]);

    const item = await eventItem('Ana Novak');
    expect(item).toHaveTextContent('spremenil(a) kontakt');
    expect(item).toHaveTextContent(tr('audit.details.fields.PHONE'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Vnos z več kot enim kontaktom: povezava na celoten vnos.
    expect(within(item).getByRole('link', { name: tr('history.event.fullEntry') })).toBeVisible();
  });

  it('FR-015-08: izhodiščno stanje je na koncu zadnje strani z ogledom in izbiro za primerjavo', async () => {
    render([historyEvent(1)], { hasInitial: true });

    const list = await timeline();
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      within(items[1] as HTMLElement).getByRole('link', { name: tr('history.initial.view') }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history/initial`);
  });

  it('FR-015-09: izbira dveh različic ponudi primerjavo (starejša je »prej«), tretje izbire ni', async () => {
    const events = historyEvents(3);
    const { user } = render(events, { hasInitial: true });
    await timeline();
    const summary = () => screen.getByRole('group', { name: tr('history.selection.summary') });
    const select = (iso: string) =>
      screen.getByRole('checkbox', {
        name: tr('history.event.selectLabel', { version: formatAuditTime(iso, 'sl') }),
      });

    expect(summary()).toHaveTextContent(tr('history.selection.hint'));
    await user.click(select(events[0]?.createdAt ?? ''));
    expect(summary()).toHaveTextContent(tr('history.selection.one'));
    await user.click(select(events[2]?.createdAt ?? ''));

    expect(screen.getByRole('link', { name: tr('history.selection.compare') })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/compare?from=${entryId(1)}&to=${entryId(3)}`,
    );
    expect(select(events[1]?.createdAt ?? '')).toBeDisabled();
    expect(
      screen.getByRole('checkbox', {
        name: tr('history.event.selectLabel', { version: tr('history.initial.heading') }),
      }),
    ).toBeDisabled();

    // Izhodiščno stanje je najstarejše.
    await user.click(select(events[2]?.createdAt ?? ''));
    await user.click(
      screen.getByRole('checkbox', {
        name: tr('history.event.selectLabel', { version: tr('history.initial.heading') }),
      }),
    );
    expect(screen.getByRole('link', { name: tr('history.selection.compare') })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/compare?from=initial&to=${entryId(3)}`,
    );
  });

  it('FR-015-09: primerjava s trenutnim stanjem pri vseh dogodkih razen pri najnovejšem (to je trenutno stanje)', async () => {
    const events = historyEvents(2);
    render(events);

    const items = within(await timeline()).getAllByRole('listitem');
    const label = (iso: string) =>
      `${tr('history.event.compareCurrent')}: ${formatAuditTime(iso, 'sl')}`;
    expect(
      within(items[0] as HTMLElement).queryByRole('link', {
        name: label(events[0]?.createdAt ?? ''),
      }),
    ).not.toBeInTheDocument();
    expect(
      within(items[1] as HTMLElement).getByRole('link', {
        name: label(events[1]?.createdAt ?? ''),
      }),
    ).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/compare?from=${entryId(1)}&to=current`,
    );
  });

  it('FR-015-09: pri izbrisanem kontaktu primerjave s trenutnim stanjem ni', async () => {
    render(
      [historyEvent(2, { action: 'DELETE', kind: 'REMOVED', hasVersion: false }), historyEvent(1)],
      { status: 'DELETED', version: null },
    );

    await timeline();
    expect(
      screen.queryByRole('link', { name: new RegExp(tr('history.event.compareCurrent')) }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-19: napaka pri nalaganju je trajno sporočilo; Poskusi znova naloži zgodovino', async () => {
    let attempt = 0;
    const { user, history } = renderHistoryApp(PATH, {
      role: 'VIEWER',
      history: {
        history: (url) => {
          attempt += 1;
          return attempt === 1
            ? { status: 500, body: { code: 'INTERNAL' } }
            : historyReply(historyEvents(2))(url);
        },
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('history.page.loadFailed'));
    expect(alert).not.toHaveTextContent('500');
    await user.click(within(alert).getByRole('button', { name: tr('history.page.retry') }));

    expect(await timeline()).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(history.of('GET', API)).toHaveLength(2);
  });

  it('FR-015-21: kontakt, ki ga ni v skupini (404), je stran »Te strani ni«', async () => {
    renderHistoryApp(PATH, {
      role: 'VIEWER',
      history: { history: () => ({ status: 404 }) },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: tr('notFound.heading') }),
    ).toBeVisible();
  });

  it('FR-015-16: v arhivirani skupini je zgodovina na voljo, obnove ni', async () => {
    renderHistoryApp(PATH, {
      role: 'OWNER',
      archived: true,
      history: { history: historyReply(historyEvents(2)) },
    });

    await timeline();
    expect(
      screen.queryByRole('button', { name: new RegExp(tr('history.restore.button')) }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-20: brez kršitev axe (sl, izbrisan kontakt z izhodiščnim stanjem in izbrano različico)', async () => {
    const { container, user } = render(
      [
        historyEvent(2, { action: 'DELETE', kind: 'REMOVED', hasVersion: false, fields: [] }),
        historyEvent(1),
      ],
      { status: 'DELETED', version: null, hasInitial: true },
      { role: 'OWNER' },
    );
    await timeline();
    await user.click(summaryOf(screen.getByRole('group', { name: tr('history.event.details') })));

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-015-20: besedila in čas v angleščini, brez kršitev axe', async () => {
    await i18n.changeLanguage('en');
    const events = historyEvents(2);
    const { container } = render(events);

    const items = within(await timeline()).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ana Novak edited a contact');
    expect(items[0]).toHaveTextContent(formatAuditTime(events[0]?.createdAt ?? '', 'en'));
    expect(items[0]).toHaveTextContent('Changed');
    expect((await axe(container)).violations).toEqual([]);
  });
});
