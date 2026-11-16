import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ok } from '../../test/auditApi';
import {
  CONTACT_ID,
  entryId,
  formatAuditTime,
  GROUP_ID,
  historyEvents,
  historyReply,
  renderHistoryApp,
  restorePreview,
  stateView,
  tr,
  version,
  type HistoryAppOptions,
} from '../../test/historyApi';

// Ogled različice kontakta (FR-015-08; design.md 9.4).

const BASE = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;
const REF = entryId(2);
const CREATED = '2026-10-12T12:32:00Z';

const FULL = stateView({
  address: 'Ulica 1\n1000 Ljubljana',
  company: 'Podjetje d.o.o.',
  country: 'SI',
  attributes: [{ key: 'kompetenca', value: 'web dev' }],
  tags: ['vip', 'konferenca'],
});

function render(ref = REF, options: HistoryAppOptions & { status?: 'ACTIVE' | 'DELETED' } = {}) {
  return renderHistoryApp(`${BASE}/history/${ref}`, {
    role: 'VIEWER',
    ...options,
    history: {
      version: (r) => ok(version(r, { createdAt: r === REF ? CREATED : null, state: FULL })),
      history: historyReply(historyEvents(2), { status: options.status ?? 'ACTIVE' }),
      ...options.history,
    },
  });
}

describe('VersionPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-08: stanje po dogodku – vsa polja, atributi in značke samo za branje, z izvajalcem in časom', async () => {
    const { history } = render();

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: tr('history.version.heading', { name: 'Janez Novak' }),
      }),
    ).toBeVisible();
    const main = screen.getByRole('main');
    expect(history.of('GET', `/versions/${REF}`)).toHaveLength(1);
    expect(main).toHaveTextContent(
      tr('history.version.entry', { time: formatAuditTime(CREATED, 'sl') }),
    );
    expect(main).toHaveTextContent(`${formatAuditTime(CREATED, 'sl')} Ana Novak uredil(a) kontakt`);
    expect(main).toHaveTextContent(tr('history.version.readOnly'));
    const terms = within(main)
      .getAllByRole('term')
      .map((term) => term.textContent);
    expect(terms).toEqual([
      tr('contacts.view.company'),
      tr('contacts.view.address'),
      tr('contacts.view.country'),
      tr('contacts.view.email'),
      tr('contacts.view.phone'),
      'kompetenca',
    ]);
    const values = within(main).getAllByRole('definition');
    expect(values[0]).toHaveTextContent('Podjetje d.o.o.');
    expect(values[2]).toHaveTextContent('Slovenija');
    expect(
      within(main)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['vip', 'konferenca']);
    expect(within(main).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: tr('history.version.back') })).toHaveAttribute(
      'href',
      `${BASE}/history`,
    );
  });

  it('FR-015-08: izhodiščno stanje nima časa dogodka', async () => {
    render('initial');

    await screen.findByRole('heading', { level: 2, name: /Janez Novak/ });
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent(tr('history.version.initial'));
    expect(main).not.toHaveTextContent('uredil(a)');
  });

  it('FR-015-09: pri obstoječem kontaktu je povezava Primerjaj s trenutno, pri izbrisanem je ni', async () => {
    const active = render();
    expect(
      await screen.findByRole('link', { name: tr('history.version.compareCurrent') }),
    ).toHaveAttribute('href', `${BASE}/compare?from=${REF}&to=current`);
    active.unmount();

    render(REF, { status: 'DELETED' });
    await screen.findByRole('heading', { level: 2, name: /Janez Novak/ });
    await waitFor(() => expect(document.title).toContain('Stanje kontakta'));
    expect(
      screen.queryByRole('link', { name: tr('history.version.compareCurrent') }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-10: obnovo ponudi samo EDITOR+ v nearhivirani skupini; po uspehu vrne na zgodovino', async () => {
    const viewer = render(REF, { role: 'VIEWER' });
    await screen.findByRole('heading', { level: 2, name: /Janez Novak/ });
    expect(
      screen.queryByRole('button', { name: tr('history.restore.button') }),
    ).not.toBeInTheDocument();
    viewer.unmount();

    const archived = render(REF, { role: 'OWNER', archived: true });
    await screen.findByRole('heading', { level: 2, name: /Janez Novak/ });
    expect(
      screen.queryByRole('button', { name: tr('history.restore.button') }),
    ).not.toBeInTheDocument();
    archived.unmount();

    const { user, history } = render(REF, {
      role: 'EDITOR',
      history: {
        preview: () => ok(restorePreview({ target: version(REF, { createdAt: CREATED }) })),
      },
    });
    await user.click(await screen.findByRole('button', { name: tr('history.restore.button') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    await waitFor(() =>
      expect(history.of('POST', '/restore')[0]?.body).toEqual({ from: REF, version: 3 }),
    );
    await waitFor(() => expect(window.location.pathname).toBe(`${BASE}/history`));
  });

  it('FR-015-08: trenutnega stanja ni mogoče obnoviti (brez gumba)', async () => {
    render('current', { role: 'EDITOR' });

    await screen.findByRole('heading', { level: 2, name: /Janez Novak/ });
    expect(
      screen.queryByRole('button', { name: tr('history.restore.button') }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-21: različica, ki je ni (404), je stran »Te strani ni«', async () => {
    renderHistoryApp(`${BASE}/history/${REF}`, {
      role: 'VIEWER',
      history: { version: () => ({ status: 404 }) },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: tr('notFound.heading') }),
    ).toBeVisible();
  });

  it('FR-015-19: napaka pri nalaganju – trajno sporočilo in Poskusi znova', async () => {
    let attempt = 0;
    const { user } = renderHistoryApp(`${BASE}/history/${REF}`, {
      role: 'VIEWER',
      history: {
        version: (r) => {
          attempt += 1;
          return attempt === 1
            ? { status: 500 }
            : ok(version(r, { createdAt: CREATED, state: FULL }));
        },
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('history.version.loadFailed'));
    await user.click(within(alert).getByRole('button', { name: tr('history.version.retry') }));
    expect(await screen.findByRole('heading', { level: 2, name: /Janez Novak/ })).toBeVisible();
  });

  it('FR-015-20: brez kršitev axe (sl in en)', async () => {
    const { container } = render(REF, { role: 'EDITOR' });
    await screen.findByRole('heading', { level: 2, name: /Janez Novak/ });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-015-20: v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { container } = render();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'State of contact Janez Novak' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveTextContent('Ana Novak edited a contact');
    expect((await axe(container)).violations).toEqual([]);
  });
});
