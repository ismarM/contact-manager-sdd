import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ok } from '../../test/auditApi';
import {
  comparison,
  CONTACT_ID,
  entryId,
  formatAuditTime,
  GROUP_ID,
  renderHistoryApp,
  restorePreview,
  stateView,
  tr,
  version,
  type HistoryAppOptions,
} from '../../test/historyApi';

// Primerjava dveh različic (FR-015-09; design.md 9.5, 10): razlike z besedilom in ikono, nespremenjena polja skrita.

const BASE = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;
const FROM = entryId(1);
const CREATED = '2026-10-12T12:32:00Z';
const PATH = `${BASE}/compare?from=${FROM}&to=current`;

/** Telefon spremenjen, atribut `kompetenca` dodan, značka `vip` odstranjena, značka `konferenca` dodana (spec, scenarij 2). */
const COMPARISON = comparison({
  from: version(FROM, {
    createdAt: CREATED,
    state: stateView({ phone: '01 234 5678', tags: ['vip', 'skupna'] }),
  }),
  to: version('current', {
    state: stateView({
      phone: '031 123 456',
      attributes: [{ key: 'kompetenca', value: 'web dev' }],
      tags: ['konferenca', 'skupna'],
      version: 3,
    }),
  }),
  changes: [
    { field: 'PHONE', key: null, before: '01 234 5678', after: '031 123 456' },
    { field: 'ATTRIBUTE', key: 'kompetenca', before: null, after: 'web dev' },
    { field: 'TAGS', key: null, before: ['vip', 'skupna'], after: ['konferenca', 'skupna'] },
  ],
});

function render(path = PATH, options: HistoryAppOptions = {}) {
  return renderHistoryApp(path, {
    role: 'VIEWER',
    ...options,
    history: { compare: () => ok(COMPARISON), ...options.history },
  });
}

const row = (table: HTMLElement, label: string) => {
  const match = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByRole('rowheader', { name: label }));
  if (!match) throw new Error(`vrstica »${label}« ne obstaja`);
  return match;
};

describe('ComparePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-09: razlike po poljih – vsaka z besedilno vrsto spremembe in vrednostmi prej/potem; značke posamično', async () => {
    const { history } = render();

    const table = await screen.findByRole('table', {
      name: tr('history.compare.caption', { name: 'Janez Novak' }),
    });
    const request = history.of('GET', '/compare')[0];
    expect(request?.search.get('from')).toBe(FROM);
    expect(request?.search.get('to')).toBe('current');
    expect(within(table).getAllByRole('row')).toHaveLength(5);

    const phone = row(table, tr('audit.details.fields.PHONE'));
    expect(phone).toHaveTextContent(tr('history.kind.CHANGED'));
    expect(phone).toHaveTextContent('01 234 5678');
    expect(phone).toHaveTextContent('031 123 456');
    expect(row(table, 'kompetenca')).toHaveTextContent(tr('history.kind.ADDED'));
    expect(row(table, 'kompetenca')).toHaveTextContent('web dev');
    expect(row(table, tr('history.compare.tag', { tag: 'vip' }))).toHaveTextContent(
      tr('history.kind.REMOVED'),
    );
    expect(row(table, tr('history.compare.tag', { tag: 'konferenca' }))).toHaveTextContent(
      tr('history.kind.ADDED'),
    );
    expect(
      screen.queryByRole('rowheader', { name: tr('history.compare.tag', { tag: 'skupna' }) }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-09: glava imena različic in naslov z imenom kontakta', async () => {
    render();

    await screen.findByRole('table');
    const versions = screen.getByRole('list', { name: tr('history.compare.versions') });
    const items = within(versions).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      `${tr('history.compare.from')}: ${tr('history.version.entry', { time: formatAuditTime(CREATED, 'sl') })}`,
    );
    expect(items[1]).toHaveTextContent(
      `${tr('history.compare.to')}: ${tr('history.version.current')}`,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Janez Novak');
  });

  it('FR-015-09: nespremenjena polja so privzeto skrita; gumb jih pokaže in spet skrije', async () => {
    const { user } = render();
    await screen.findByRole('table');

    expect(
      screen.queryByRole('table', {
        name: tr('history.compare.captionUnchanged', { name: 'Janez Novak' }),
      }),
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: tr('history.compare.showUnchanged') });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    const unchanged = screen.getByRole('table', {
      name: tr('history.compare.captionUnchanged', { name: 'Janez Novak' }),
    });
    expect(row(unchanged, tr('audit.details.fields.FIRST_NAME'))).toHaveTextContent(
      tr('history.kind.UNCHANGED'),
    );
    expect(row(unchanged, tr('audit.details.fields.EMAIL'))).toHaveTextContent('janez@primer.si');
    expect(row(unchanged, tr('history.compare.tag', { tag: 'skupna' }))).toHaveTextContent(
      tr('history.kind.UNCHANGED'),
    );
    expect(
      screen.getByRole('button', { name: tr('history.compare.hideUnchanged') }),
    ).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: tr('history.compare.hideUnchanged') }));
    expect(
      screen.queryByRole('table', {
        name: tr('history.compare.captionUnchanged', { name: 'Janez Novak' }),
      }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-09: brez razlik – sporočilo, nespremenjena polja še vedno na voljo', async () => {
    render(PATH, { history: { compare: () => ok(comparison({ changes: [] })) } });

    expect(await screen.findByRole('status')).toHaveTextContent(
      tr('history.compare.noDifferences'),
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: tr('history.compare.showUnchanged') })).toBeVisible();
  });

  it('FR-015-09: izhodiščno stanje in trenutno stanje imata ustrezni oznaki', async () => {
    render(`${BASE}/compare?from=initial&to=${FROM}`, {
      history: {
        compare: () =>
          ok(comparison({ from: version('initial'), to: version(FROM, { createdAt: CREATED }) })),
      },
    });

    const versions = await screen.findByRole('list', { name: tr('history.compare.versions') });
    expect(within(versions).getAllByRole('listitem')[0]).toHaveTextContent(
      tr('history.version.initial'),
    );
  });

  it('FR-015-09: manjkajoči ali enaki sklici – sporočilo brez zahtevka', async () => {
    const { history } = render(`${BASE}/compare?from=${FROM}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(tr('history.compare.invalid'));
    expect(history.of('GET', '/compare')).toHaveLength(0);
  });

  it('FR-015-09: 400 strežnika – sporočilo; 404 – »Te strani ni«', async () => {
    const bad = render(PATH, {
      history: { compare: () => ({ status: 400, body: { code: 'VALIDATION_FAILED' } }) },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('history.compare.invalid'));
    bad.unmount();

    render(PATH, { history: { compare: () => ({ status: 404 }) } });
    expect(
      await screen.findByRole('heading', { level: 1, name: tr('notFound.heading') }),
    ).toBeVisible();
  });

  it('FR-015-19: napaka pri nalaganju – trajno sporočilo in Poskusi znova', async () => {
    let attempt = 0;
    const { user } = render(PATH, {
      history: {
        compare: () => {
          attempt += 1;
          return attempt === 1 ? { status: 500 } : ok(COMPARISON);
        },
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('history.compare.loadFailed'));
    await user.click(within(alert).getByRole('button', { name: tr('history.compare.retry') }));
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('FR-015-10: obnovo zabeležene različice ponudi samo EDITOR+ v nearhivirani skupini, trenutnega stanja ne', async () => {
    const viewer = render();
    await screen.findByRole('table');
    expect(
      screen.queryByRole('button', { name: new RegExp(tr('history.restore.button')) }),
    ).not.toBeInTheDocument();
    viewer.unmount();

    const { user, history } = render(PATH, {
      role: 'EDITOR',
      history: {
        compare: () => ok(COMPARISON),
        preview: () => ok(restorePreview({ target: version(FROM, { createdAt: CREATED }) })),
      },
    });
    await screen.findByRole('table');
    const buttons = screen.getAllByRole('button', {
      name: new RegExp(tr('history.restore.button')),
    });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    await waitFor(() =>
      expect(history.of('POST', '/restore')[0]?.body).toEqual({ from: FROM, version: 3 }),
    );
    await waitFor(() => expect(window.location.pathname).toBe(`${BASE}/history`));
  });

  it('FR-015-20: brez kršitev axe z razkritimi nespremenjenimi polji (sl in en)', async () => {
    const { user, container } = render(PATH, { role: 'EDITOR' });
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: tr('history.compare.showUnchanged') }));
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-015-20: v angleščini z besedilnimi oznakami vrste spremembe', async () => {
    await i18n.changeLanguage('en');
    const { container } = render();

    const table = await screen.findByRole('table');
    expect(row(table, 'Phone')).toHaveTextContent('Changed');
    expect(row(table, 'kompetenca')).toHaveTextContent('Added');
    expect(row(table, 'Tag vip')).toHaveTextContent('Removed');
    expect((await axe(container)).violations).toEqual([]);
  });
});
