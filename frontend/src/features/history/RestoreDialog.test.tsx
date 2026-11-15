import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  duplicate,
  entryId,
  formatAuditTime,
  GROUP_ID,
  historyEvents,
  historyReply,
  renderHistoryApp,
  restorePreview,
  tr,
  version,
} from '../../test/historyApi';
import type { HistoryAppOptions } from '../../test/historyApi';

// Dialog obnove kontakta (FR-015-10 … -15, -19; design.md 8.11, 8.13, 8.14).

const PATH = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`;
const EVENTS = historyEvents(3);
/** Obnavlja se najstarejši dogodek (oznaka 1). */
const TARGET = EVENTS[2];
const TARGET_TIME = formatAuditTime(TARGET?.createdAt ?? '', 'sl');
const restoreButton = (time = TARGET_TIME) =>
  screen.getByRole('button', { name: `${tr('history.restore.button')}: ${time}` });
const dialogName = () => tr('history.restore.title', { name: 'Janez Novak', time: TARGET_TIME });

function preview(overrides: Parameters<typeof restorePreview>[0] = {}) {
  return restorePreview({
    target: version(entryId(1), { createdAt: TARGET?.createdAt ?? null }),
    ...overrides,
  });
}

function render(
  options: HistoryAppOptions & { contact?: Parameters<typeof historyReply>[1] } = {},
) {
  return renderHistoryApp(PATH, {
    role: 'EDITOR',
    ...options,
    history: {
      history: historyReply(EVENTS, options.contact ?? {}),
      preview: () => ({ status: 200, body: preview() as never }),
      ...options.history,
    },
  });
}

async function openDialog(user: ReturnType<typeof render>['user'], name = dialogName()) {
  await screen.findByRole('list', { name: tr('history.page.events') });
  await user.click(restoreButton());
  return screen.findByRole('dialog', { name });
}

describe('RestoreDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-10: gumb Obnovi to različico imajo EDITOR+ v nearhivirani skupini, ne pri najnovejšem dogodku (trenutno stanje)', async () => {
    render({ role: 'OWNER' });

    await screen.findByRole('list', { name: tr('history.page.events') });
    const buttons = screen.getAllByRole('button', {
      name: new RegExp(tr('history.restore.button')),
    });
    expect(buttons).toHaveLength(2);
    expect(
      screen.queryByRole('button', {
        name: `${tr('history.restore.button')}: ${formatAuditTime(EVENTS[0]?.createdAt ?? '', 'sl')}`,
      }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-10: bralec in arhivirana skupina gumba ne vidita', async () => {
    const viewer = render({ role: 'VIEWER' });
    await screen.findByRole('list', { name: tr('history.page.events') });
    expect(
      screen.queryByRole('button', { name: new RegExp(tr('history.restore.button')) }),
    ).not.toBeInTheDocument();
    viewer.unmount();

    render({ role: 'OWNER', archived: true });
    await screen.findByRole('list', { name: tr('history.page.events') });
    expect(
      screen.queryByRole('button', { name: new RegExp(tr('history.restore.button')) }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-11: dialog ima naslov z imenom in časom, predogled sprememb, posledico in fokus na Prekliči', async () => {
    const { user, history } = render();

    const dialog = await openDialog(user);

    await waitFor(() =>
      expect(history.of('GET', '/restore-preview')[0]?.search.get('from')).toBe(entryId(1)),
    );
    expect(
      within(dialog).getByRole('button', { name: tr('history.restore.cancel') }),
    ).toHaveFocus();
    const table = await within(dialog).findByRole('table');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(
      `${tr('audit.details.fields.PHONE')}031 123 45601 234 5678`,
    );
    expect(dialog).toHaveTextContent(tr('history.restore.text'));
    expect(
      within(dialog).getByRole('button', { name: tr('history.restore.confirm') }),
    ).toBeVisible();
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
  });

  it('FR-015-11: Esc zapre dialog brez zahtevka, fokus se vrne na gumb', async () => {
    const { user, history } = render();
    const trigger = await screen
      .findByRole('list', { name: tr('history.page.events') })
      .then(() => restoreButton());
    await user.click(trigger);
    await screen.findByRole('dialog', { name: dialogName() });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(history.of('POST', '/restore')).toHaveLength(0);
    expect(trigger).toHaveFocus();
  });

  it('FR-015-12: potrditev pošlje from in verzijo iz predogleda, pokaže obvestilo, osveži zgodovino, fokus na naslov', async () => {
    const { user, history } = render();
    const dialog = await openDialog(user);

    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    await waitFor(() => expect(history.of('POST', '/restore')).toHaveLength(1));
    expect(history.of('POST', '/restore')[0]?.body).toEqual({ from: entryId(1), version: 3 });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: tr('toast.region') })).toHaveTextContent(
        tr('history.restore.toast', { time: TARGET_TIME }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(history.of('GET', '/history')).toHaveLength(2));
    expect(screen.getByRole('heading', { level: 2, name: /Zgodovina kontakta/ })).toHaveFocus();
  });

  it('FR-015-14: opozorilo o možnem podvajanju (role=status) s povezavo na obstoječi kontakt ne blokira obnove', async () => {
    const { user, history } = render({
      history: {
        preview: () => ({
          status: 200,
          body: preview({
            duplicates: [
              duplicate(),
              duplicate({ contactId: 'x2', displayName: 'Janez Novak', reason: 'NAME' }),
            ],
          }) as never,
        }),
      },
    });
    const dialog = await openDialog(user);

    const warning = await within(dialog).findByRole('status');
    expect(warning).toHaveTextContent(tr('history.restore.duplicates'));
    expect(within(warning).getByRole('link', { name: 'Janez Novak (drugi)' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/0193c4a2-7a1f-7c3e-9b1a-c0ffee0000d1`,
    );
    expect(warning).toHaveTextContent(tr('history.restore.duplicateEMAIL'));
    expect(warning).toHaveTextContent(tr('history.restore.duplicateNAME'));
    await user.click(within(dialog).getByRole('button', { name: tr('history.restore.confirm') }));
    await waitFor(() => expect(history.of('POST', '/restore')).toHaveLength(1));
  });

  it('FR-015-13: konflikt verzij – opozorilo, osvežen predogled in zgodovina; nova potrditev pošlje novo verzijo', async () => {
    let previews = 0;
    let posts = 0;
    const { user, history } = render({
      history: {
        preview: () => {
          previews += 1;
          return {
            status: 200,
            body: preview({ currentVersion: previews === 1 ? 3 : 4 }) as never,
          };
        },
        restore: () => {
          posts += 1;
          return posts === 1
            ? { status: 409, body: { code: 'VERSION_CONFLICT' } }
            : { status: 201, body: {} };
        },
      },
    });
    const dialog = await openDialog(user);
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(tr('history.restore.conflict'));
    expect(alert).not.toHaveTextContent('409');
    await waitFor(() => expect(history.of('GET', '/restore-preview')).toHaveLength(2));
    await waitFor(() => expect(history.of('GET', '/history')).toHaveLength(2));
    expect(screen.getByRole('dialog', { name: dialogName() })).toBeVisible();

    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );
    await waitFor(() => expect(history.of('POST', '/restore')).toHaveLength(2));
    expect(history.of('POST', '/restore')[1]?.body).toEqual({ from: entryId(1), version: 4 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('FR-015-19: napaka ob obnovi ostane ob dialogu brez tehničnih kod, Poskusi znova ponovi zahtevek', async () => {
    let posts = 0;
    const { user, history } = render({
      history: {
        restore: () => {
          posts += 1;
          return posts === 1
            ? { status: 500, body: { code: 'INTERNAL' } }
            : { status: 201, body: {} };
        },
      },
    });
    const dialog = await openDialog(user);
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(tr('history.restore.failed'));
    expect(alert).not.toHaveTextContent('500');
    expect(screen.getByRole('dialog', { name: dialogName() })).toBeVisible();
    await user.click(within(alert).getByRole('button', { name: tr('history.restore.retry') }));

    await waitFor(() => expect(history.of('POST', '/restore')).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('FR-015-19: neuspel predogled – napaka s Poskusi znova', async () => {
    let previews = 0;
    const { user } = render({
      history: {
        preview: () => {
          previews += 1;
          return previews === 1 ? { status: 500 } : { status: 200, body: preview() as never };
        },
      },
    });
    const dialog = await openDialog(
      user,
      tr('history.restore.titleLoading', { name: 'Janez Novak' }),
    );

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(tr('history.restore.loadFailed'));
    await user.click(within(alert).getByRole('button', { name: tr('history.restore.retry') }));

    expect(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    ).toBeVisible();
  });

  it('FR-015-14: združen kontakt – razlaga namesto potrditve', async () => {
    const { user } = render({
      history: {
        preview: () => ({
          status: 200,
          body: preview({
            status: 'MERGED',
            restorable: false,
            reason: 'MERGED',
            currentVersion: null,
          }) as never,
        }),
      },
    });
    const dialog = await openDialog(user);

    expect(await within(dialog).findByRole('note')).toHaveTextContent(tr('history.restore.merged'));
    expect(
      within(dialog).queryByRole('button', { name: tr('history.restore.confirm') }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: tr('history.restore.close') })).toHaveFocus();
  });

  it('FR-015-15: različica enaka trenutnemu stanju – razlaga, brez potrditve', async () => {
    const { user } = render({
      history: {
        preview: () => ({
          status: 200,
          body: preview({ restorable: false, reason: 'NO_CHANGES', changes: [] }) as never,
        }),
      },
    });
    const dialog = await openDialog(user);

    expect(await within(dialog).findByRole('note')).toHaveTextContent(
      tr('history.restore.noChanges'),
    );
    expect(
      within(dialog).queryByRole('button', { name: tr('history.restore.confirm') }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-15: strežnik zavrne obnovo z RESTORE_NO_CHANGES – predogled pokaže razlago', async () => {
    let previews = 0;
    const { user } = render({
      history: {
        preview: () => {
          previews += 1;
          return {
            status: 200,
            body: (previews === 1
              ? preview()
              : preview({ restorable: false, reason: 'NO_CHANGES', changes: [] })) as never,
          };
        },
        restore: () => ({ status: 409, body: { code: 'RESTORE_NO_CHANGES' } }),
      },
    });
    const dialog = await openDialog(user);
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    expect(await within(dialog).findByRole('note')).toHaveTextContent(
      tr('history.restore.noChanges'),
    );
  });

  it('FR-015-14: izbrisan kontakt – telo obnove vsebuje lastEntryId iz predogleda', async () => {
    const { user, history } = render({
      contact: { status: 'DELETED', version: null },
      history: {
        preview: () => ({
          status: 200,
          body: preview({
            status: 'DELETED',
            currentVersion: null,
            lastEntryId: entryId(9),
          }) as never,
        }),
      },
    });
    const dialog = await openDialog(user);
    expect(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(tr('history.restore.textDeleted'));

    await user.click(within(dialog).getByRole('button', { name: tr('history.restore.confirm') }));

    await waitFor(() => expect(history.of('POST', '/restore')).toHaveLength(1));
    expect(history.of('POST', '/restore')[0]?.body).toEqual({
      from: entryId(1),
      lastEntryId: entryId(9),
    });
  });

  it('FR-015-08: obnova izhodiščnega stanja – naslov in obvestilo brez časa, from = initial', async () => {
    const { user, history } = render({
      contact: { hasInitial: true },
      history: {
        history: historyReply(historyEvents(2), { hasInitial: true }),
        preview: () => ({
          status: 200,
          body: preview({ target: version('initial') }) as never,
        }),
      },
    });
    await screen.findByRole('list', { name: tr('history.page.events') });
    await user.click(
      screen.getByRole('button', {
        name: `${tr('history.restore.button')}: ${tr('history.initial.heading')}`,
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: tr('history.restore.titleInitial', { name: 'Janez Novak' }),
    });

    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    await waitFor(() =>
      expect(history.of('POST', '/restore')[0]?.body).toEqual({ from: 'initial', version: 3 }),
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: tr('toast.region') })).toHaveTextContent(
        tr('history.restore.toastInitial'),
      ),
    );
  });

  it('FR-015-16: 409 GROUP_ARCHIVED – sporočilo, brez gumba za potrditev', async () => {
    const { user } = render({
      history: { restore: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }) },
    });
    const dialog = await openDialog(user);
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      tr('history.restore.archived'),
    );
    expect(
      within(dialog).queryByRole('button', { name: tr('history.restore.confirm') }),
    ).not.toBeInTheDocument();
  });

  it('FR-015-10: 403 – sporočilo o pravicah', async () => {
    const { user } = render({
      history: { restore: () => ({ status: 403, body: { code: 'FORBIDDEN' } }) },
    });
    const dialog = await openDialog(user);
    await user.click(
      await within(dialog).findByRole('button', { name: tr('history.restore.confirm') }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      tr('history.restore.forbidden'),
    );
  });

  it('FR-015-20: odprt dialog brez kršitev axe (sl in en)', async () => {
    const { user, baseElement } = render({
      history: {
        preview: () => ({ status: 200, body: preview({ duplicates: [duplicate()] }) as never }),
      },
    });
    const dialog = await openDialog(user);
    await within(dialog).findByRole('status');

    expect((await axe(baseElement)).violations).toEqual([]);
  });

  it('FR-015-11: dialog v angleščini', async () => {
    await i18n.changeLanguage('en');
    const time = formatAuditTime(TARGET?.createdAt ?? '', 'en');
    const { user } = render();
    await screen.findByRole('list', { name: tr('history.page.events') });
    await user.click(screen.getByRole('button', { name: `Restore this version: ${time}` }));

    const dialog = await screen.findByRole('dialog', {
      name: `Restore contact Janez Novak to the state of ${time}?`,
    });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(await within(dialog).findByRole('button', { name: 'Restore contact' })).toBeVisible();
  });
});
