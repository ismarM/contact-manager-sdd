import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ok } from '../../test/auditApi';
import {
  ANA,
  deletedItem,
  deletedReply,
  entryId,
  formatAuditTime,
  GROUP_ID,
  historyEvent,
  historyReply,
  renderHistoryApp,
  restorePreview,
  tr,
  version,
  type HistoryAppOptions,
} from '../../test/historyApi';
import type { DeletedItem } from './types';

// Seznam izbrisanih kontaktov (FR-015-22 … -24, -14; design.md 8.9, 8.15).

const PATH = `/groups/${GROUP_ID}/deleted-contacts`;
const KEPT_ID = '0193c4a2-7a1f-7c3e-9b1a-c0ffee0000e1';

const MERGED = deletedItem(2, {
  displayName: 'Združen Kontakt',
  reason: 'MERGED',
  restorable: false,
  mergedInto: { contactId: KEPT_ID, displayName: 'Ohranjen Kontakt', exists: true },
});

function render(all: DeletedItem[] = [], options: HistoryAppOptions & { path?: string } = {}) {
  return renderHistoryApp(options.path ?? PATH, {
    role: 'VIEWER',
    ...options,
    history: { deleted: (url) => deletedReply(all)(url), ...options.history },
  });
}

const list = () => screen.findByRole('list', { name: tr('history.deleted.list') });
async function row(text: string) {
  const match = within(await list())
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(text));
  if (!match) throw new Error(`vrstica »${text}« ne obstaja`);
  return match;
}

describe('DeletedContactsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-22: vrstica ima ime, e-naslov, podjetje, kdo je odstranil in kdaj, oznako Obnovljiv ter povezavo Zgodovina', async () => {
    const item = deletedItem(1, { displayName: 'Marija Kovač' });
    const { history } = render([item]);

    const li = await row('Marija Kovač');
    expect(li).toHaveTextContent('izbrisan001@primer.si · Podjetje 001');
    expect(li).toHaveTextContent(
      tr('history.deleted.removed', {
        actor: ANA.name,
        time: formatAuditTime(item.removedAt, 'sl'),
      }),
    );
    expect(li).toHaveTextContent(tr('history.deleted.badgeRestorable'));
    expect(
      within(li).getByRole('link', {
        name: tr('history.deleted.historyLabel', { name: 'Marija Kovač' }),
      }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/contacts/${item.contactId}/history`);
    expect(history.of('GET', '/deleted-contacts')[0]?.search.toString()).toBe('page=0&size=25');
    expect(
      screen.getByRole('heading', { level: 2, name: tr('history.deleted.heading') }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.title).toBe('Izbrisani kontakti – Projekt FERI – Kontakti'),
    );
  });

  it('FR-015-22: v glavi skupine je zavihek Izbrisani kontakti trenutna stran (aria-current)', async () => {
    render([]);

    const header = await screen.findByRole('region', { name: 'Projekt FERI' });
    const sections = within(header).getByRole('navigation', { name: tr('groups.header.sections') });
    expect(
      within(sections).getByRole('link', { name: tr('contacts.deletedLink') }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(sections).getByRole('link', { name: tr('groups.header.contacts') }),
    ).not.toHaveAttribute('aria-current');
    expect(
      within(sections).getByRole('link', { name: tr('groups.header.audit') }),
    ).not.toHaveAttribute('aria-current');
  });

  it('FR-015-22: izbrisan uporabnik kot izvajalec odstranitve', async () => {
    render([deletedItem(1, { removedBy: null })]);

    expect(await row('Izbrisan 001')).toHaveTextContent(
      tr('history.deleted.removed', {
        actor: tr('audit.list.deletedUser'),
        time: formatAuditTime(deletedItem(1).removedAt, 'sl'),
      }),
    );
  });

  it('FR-015-23: iskanje se zapiše v pot (po zakasnitvi) in zoži seznam', async () => {
    const all = [deletedItem(3, { displayName: 'Ana Kranjc' }), deletedItem(2), deletedItem(1)];
    const { user, history } = render(all);
    await list();

    await user.type(
      screen.getByRole('searchbox', { name: tr('history.deleted.searchLabel') }),
      'kranjc',
    );

    await waitFor(() => expect(window.location.search).toBe('?q=kranjc'));
    await waitFor(() =>
      expect(history.of('GET', '/deleted-contacts').at(-1)?.search.get('q')).toBe('kranjc'),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: tr('history.deleted.list') })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(1),
    );
  });

  it('FR-015-23: filter Vsi / Obnovljivi / Združeni je skupina izbirnih gumbov in je v poti', async () => {
    const { user, history } = render([deletedItem(3), MERGED, deletedItem(1)]);
    await list();

    const group = screen.getByRole('group', { name: tr('history.deleted.stateLegend') });
    expect(
      within(group).getByRole('radio', { name: tr('history.deleted.state.all') }),
    ).toBeChecked();
    await user.click(
      within(group).getByRole('radio', { name: tr('history.deleted.state.merged') }),
    );

    await waitFor(() => expect(window.location.search).toBe('?state=merged'));
    await waitFor(() =>
      expect(history.of('GET', '/deleted-contacts').at(-1)?.search.get('state')).toBe('merged'),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: tr('history.deleted.list') })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(1),
    );
    expect(
      within(group).getByRole('radio', { name: tr('history.deleted.state.merged') }),
    ).toBeChecked();

    await user.click(within(group).getByRole('radio', { name: tr('history.deleted.state.all') }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('FR-015-23: stanje iz poti (q, state, page, size) se prenese v zahtevek in v kontrole', async () => {
    const { history } = render(
      Array.from({ length: 60 }, (_, i) => deletedItem(60 - i)),
      { path: `${PATH}?q=izbrisan&state=restorable&page=2&size=25` },
    );

    await list();
    const request = history.of('GET', '/deleted-contacts')[0];
    expect(request?.search.get('q')).toBe('izbrisan');
    expect(request?.search.get('state')).toBe('restorable');
    expect(request?.search.get('page')).toBe('1');
    expect(screen.getByRole('searchbox', { name: tr('history.deleted.searchLabel') })).toHaveValue(
      'izbrisan',
    );
    expect(
      screen.getByRole('radio', { name: tr('history.deleted.state.restorable') }),
    ).toBeChecked();
  });

  it('FR-015-22: več kot 25 izbrisanih – paginacija po skupnem slovarju, stran v poti', async () => {
    const { user, history } = render(Array.from({ length: 40 }, (_, i) => deletedItem(40 - i)));
    expect(within(await list()).getAllByRole('listitem')).toHaveLength(25);

    const nav = screen.getByRole('navigation', {
      name: tr('groups.pagination.label', { list: tr('history.deleted.paginationList') }),
    });
    expect(nav).toHaveTextContent('1–25 od 40');
    await user.click(within(nav).getByRole('button', { name: tr('groups.pagination.next') }));

    await waitFor(() => expect(window.location.search).toBe('?page=2'));
    await waitFor(() =>
      expect(history.of('GET', '/deleted-contacts').at(-1)?.search.get('page')).toBe('1'),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: tr('history.deleted.list') })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(15),
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
  });

  it('FR-015-22: prazen seznam – razlaga brez akcije; iskanje brez zadetkov – Počisti iskanje', async () => {
    const empty = render([]);
    expect(
      await screen.findByRole('heading', { level: 3, name: tr('history.deleted.empty') }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: tr('history.deleted.clearSearch') }),
    ).not.toBeInTheDocument();
    empty.unmount();

    const { user } = render([deletedItem(1)], { path: `${PATH}?q=nič` });
    expect(
      await screen.findByRole('heading', { level: 3, name: tr('history.deleted.emptyFiltered') }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('history.deleted.clearSearch') }));

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await list()).toBeVisible();
    expect(screen.getByRole('searchbox', { name: tr('history.deleted.searchLabel') })).toHaveValue(
      '',
    );
  });

  it('FR-015-24: združen kontakt – oznaka, razlaga z imenom, povezavi Zgodovina in Odpri ohranjeni kontakt, brez Obnovi', async () => {
    render([MERGED, deletedItem(1)], { role: 'OWNER' });

    const li = await row('Združen Kontakt');
    expect(li).toHaveTextContent(tr('history.deleted.badgeMerged', { name: 'Ohranjen Kontakt' }));
    expect(li).toHaveTextContent(tr('history.deleted.explain', { name: 'Ohranjen Kontakt' }));
    expect(li).toHaveTextContent('skupinskim rollbackom');
    expect(within(li).getByRole('link', { name: tr('history.deleted.openKept') })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${KEPT_ID}`,
    );
    expect(
      within(li).getByRole('link', {
        name: tr('history.deleted.historyLabel', { name: 'Združen Kontakt' }),
      }),
    ).toBeVisible();
    expect(within(li).queryByRole('button')).not.toBeInTheDocument();
    // Obnovljiv kontakt istega seznama gumb ima.
    expect(
      within(await row('Izbrisan 001')).getByRole('button', {
        name: tr('history.deleted.restoreLabel', { name: 'Izbrisan 001' }),
      }),
    ).toBeVisible();
  });

  it('FR-015-24: ohranjeni kontakt ni več v skupini – brez povezave nanj', async () => {
    render([
      deletedItem(2, {
        reason: 'MERGED',
        restorable: false,
        mergedInto: { contactId: KEPT_ID, displayName: 'Ohranjen Kontakt', exists: false },
      }),
    ]);

    const li = await row('Izbrisan 002');
    expect(li).toHaveTextContent(tr('history.deleted.keptGone'));
    expect(
      within(li).queryByRole('link', { name: tr('history.deleted.openKept') }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-10: Obnovi imajo EDITOR+ v nearhivirani skupini; bralec in arhivirana skupina ne', async () => {
    const viewer = render([deletedItem(1)], { role: 'VIEWER' });
    await row('Izbrisan 001');
    expect(
      screen.queryByRole('button', { name: new RegExp(tr('history.deleted.restore')) }),
    ).not.toBeInTheDocument();
    viewer.unmount();

    const archived = render([deletedItem(1)], { role: 'OWNER', archived: true });
    await row('Izbrisan 001');
    expect(
      screen.queryByRole('button', { name: new RegExp(tr('history.deleted.restore')) }),
    ).not.toBeInTheDocument();
    archived.unmount();

    render([deletedItem(1)], { role: 'EDITOR' });
    expect(
      within(await row('Izbrisan 001')).getByRole('button', {
        name: tr('history.deleted.restoreLabel', { name: 'Izbrisan 001' }),
      }),
    ).toBeVisible();
  });

  it('FR-015-14: Obnovi – zadnja zabeležena različica iz zgodovine, predogled, potrditev; kontakt izgine s seznama', async () => {
    let restored = false;
    const item = deletedItem(1);
    const events = [
      historyEvent(2, { action: 'DELETE', kind: 'REMOVED', hasVersion: false, fields: [] }),
      historyEvent(1),
    ];
    const { user, history } = renderHistoryApp(PATH, {
      role: 'EDITOR',
      history: {
        deleted: (url) => deletedReply(restored ? [] : [item])(url),
        history: historyReply(events, {
          status: 'DELETED',
          version: null,
          lastEntryId: entryId(2),
        }),
        preview: () =>
          ok(
            restorePreview({
              target: version(entryId(1), { createdAt: events[1]?.createdAt ?? null }),
              status: 'DELETED',
              currentVersion: null,
              lastEntryId: entryId(2),
            }),
          ),
        restore: () => {
          restored = true;
          return { status: 201, body: {} };
        },
      },
    });
    const li = await row('Izbrisan 001');
    await user.click(
      within(li).getByRole('button', {
        name: tr('history.deleted.restoreLabel', { name: 'Izbrisan 001' }),
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: tr('history.restore.title', {
        name: 'Izbrisan 001',
        time: formatAuditTime(events[1]?.createdAt ?? '', 'sl'),
      }),
    });
    await waitFor(() =>
      expect(history.of('GET', '/restore-preview')[0]?.search.get('from')).toBe(entryId(1)),
    );
    expect(
      within(dialog).getByRole('button', { name: tr('history.restore.cancel') }),
    ).toHaveFocus();
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    await waitFor(() => expect(history.of('POST', '/restore')).toHaveLength(1));
    expect(history.of('POST', '/restore')[0]?.body).toEqual({
      from: entryId(1),
      lastEntryId: entryId(2),
    });
    expect(
      await screen.findByRole('heading', { level: 3, name: tr('history.deleted.empty') }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    expect(screen.getByRole('region', { name: tr('toast.region') })).toHaveTextContent(
      tr('history.restore.toast', { time: formatAuditTime(events[1]?.createdAt ?? '', 'sl') }),
    );
  });

  it('FR-015-14: kontakt brez različic razen izhodiščne se obnovi na izhodiščno stanje', async () => {
    const { user, history } = renderHistoryApp(PATH, {
      role: 'EDITOR',
      history: {
        deleted: (url) => deletedReply([deletedItem(1)])(url),
        history: historyReply(
          [historyEvent(2, { action: 'DELETE', kind: 'REMOVED', hasVersion: false, fields: [] })],
          { status: 'DELETED', version: null, hasInitial: true },
        ),
        preview: () =>
          ok(
            restorePreview({ target: version('initial'), status: 'DELETED', currentVersion: null }),
          ),
      },
    });
    await user.click(
      within(await row('Izbrisan 001')).getByRole('button', {
        name: tr('history.deleted.restoreLabel', { name: 'Izbrisan 001' }),
      }),
    );

    await screen.findByRole('dialog', {
      name: tr('history.restore.titleInitial', { name: 'Izbrisan 001' }),
    });
    await waitFor(() =>
      expect(history.of('GET', '/restore-preview')[0]?.search.get('from')).toBe('initial'),
    );
  });

  it('FR-015-19: napaka pri nalaganju – trajno sporočilo in Poskusi znova', async () => {
    let attempt = 0;
    const { user } = renderHistoryApp(PATH, {
      role: 'VIEWER',
      history: {
        deleted: (url) => {
          attempt += 1;
          return attempt === 1 ? { status: 500 } : deletedReply([deletedItem(1)])(url);
        },
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('history.deleted.loadFailed'));
    await user.click(within(alert).getByRole('button', { name: tr('history.deleted.retry') }));
    expect(await list()).toBeVisible();
  });

  it('FR-015-22: pot deluje tudi v arhivirani skupini (branje)', async () => {
    render([deletedItem(1)], { role: 'VIEWER', archived: true });

    expect(await row('Izbrisan 001')).toBeVisible();
  });

  it('FR-015-20: brez kršitev axe (sl) z obnovljivim in združenim kontaktom ter odprtim dialogom obnove', async () => {
    const { container, user, baseElement } = render([MERGED, deletedItem(1)], { role: 'OWNER' });
    await list();
    expect((await axe(container)).violations).toEqual([]);

    await user.click(
      within(await row('Izbrisan 001')).getByRole('button', {
        name: tr('history.deleted.restoreLabel', { name: 'Izbrisan 001' }),
      }),
    );
    await screen.findByRole('dialog');
    expect((await axe(baseElement)).violations).toEqual([]);
  });

  it('FR-015-20: v angleščini, brez kršitev axe', async () => {
    await i18n.changeLanguage('en');
    const { container } = render([MERGED, deletedItem(1)], { role: 'OWNER' });

    const items = within(
      await screen.findByRole('list', { name: 'List of deleted contacts' }),
    ).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Merged into Ohranjen Kontakt');
    expect(items[1]).toHaveTextContent('Restorable');
    expect(items[1]).toHaveTextContent('Removed by Ana Novak');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-015-22: neznana vrednost stanja v poti se prezre', async () => {
    const { history } = render([deletedItem(1)], { path: `${PATH}?state=foo` });

    await list();
    expect(history.of('GET', '/deleted-contacts')[0]?.search.has('state')).toBe(false);
  });
});
