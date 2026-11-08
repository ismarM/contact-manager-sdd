import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  auditEntries,
  auditEntry,
  auditPageReply,
  created,
  entryId,
  formatAuditTime,
  GROUP_ID,
  type AuditAppOptions,
  renderAuditApp,
} from '../../test/auditApi';
import { todayAt } from '../../test/contactsApi';

// Rollback na točko sledi: dialog, uspeh, napake, najnovejši vnos (FR-005-11, -12, -14 … -18, -20).

const PATH = `/groups/${GROUP_ID}/audit`;
const LIST_API = `/api/groups/${GROUP_ID}/audit`;
const BUTTON = 'Povrni skupino na to točko';
const NEWEST = entryId(3);
const TARGET_TIME = todayAt(14, 32);

/** Trije vnosi: najnovejši (3), srednji iz `todayAt(14, 32)` (2) in najstarejši (1). */
function trail() {
  return [
    auditEntry({ id: entryId(3), createdAt: todayAt(15, 10), contactName: 'Tretji' }),
    auditEntry({ id: entryId(2), createdAt: TARGET_TIME, contactName: 'Drugi' }),
    auditEntry({ id: entryId(1), createdAt: todayAt(9, 5), contactName: 'Prvi' }),
  ];
}

function renderTrail(
  path = PATH,
  handlers: AuditAppOptions['handlers'] = {},
  role: AuditAppOptions['role'] = 'ADMIN',
) {
  return renderAuditApp(path, {
    role,
    handlers: { list: auditPageReply(trail()), ...handlers },
  });
}

const entryItem = async (text: string) => {
  const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
  const match = within(list)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(text));
  if (!match) throw new Error(`vnos »${text}« ne obstaja`);
  return match;
};

const dialogName = `Povrnem skupino na stanje ${formatAuditTime(TARGET_TIME, 'sl')}?`;

async function openDialog(user: ReturnType<typeof renderTrail>['user']) {
  const item = await entryItem('Drugi');
  await user.click(within(item).getByRole('button', { name: BUTTON }));
  return screen.findByRole('dialog', { name: dialogName });
}

describe('AuditRollback', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-005-15: pri najnovejšem vnosu ni gumba za rollback, pri drugih je', async () => {
    renderTrail();

    const newest = await entryItem('Tretji');
    expect(within(newest).queryByRole('button', { name: BUTTON })).not.toBeInTheDocument();
    expect(within(await entryItem('Drugi')).getByRole('button', { name: BUTTON })).toBeVisible();
    expect(within(await entryItem('Prvi')).getByRole('button', { name: BUTTON })).toBeVisible();
  });

  it('FR-005-15: pravilo velja za najnovejši vnos celotne sledi – tudi ko ga filter skrije', async () => {
    renderAuditApp(`${PATH}?action=DELETE`, {
      role: 'ADMIN',
      handlers: { list: auditPageReply(auditEntries(6), { latestEntryId: entryId(6) }) },
    });

    const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(within(item).getByRole('button', { name: BUTTON })).toBeVisible();
    }
  });

  it('FR-005-14: rollback iz filtriranega pogleda pošlje latestEntryId celotne sledi, ne prikazanega vnosa', async () => {
    const { user, api } = renderAuditApp(`${PATH}?action=DELETE`, {
      role: 'ADMIN',
      handlers: { list: auditPageReply(auditEntries(6), { latestEntryId: entryId(6) }) },
    });
    const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    const item = within(list).getAllByRole('listitem')[0] as HTMLElement;
    expect(item).not.toHaveTextContent('Kontakt 006');

    await user.click(within(item).getByRole('button', { name: BUTTON }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Povrni skupino' }),
    );

    await waitFor(() => expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(1));
    expect(api.requests.find((r) => r.method === 'POST')?.body).toEqual({
      latestEntryId: entryId(6),
    });
  });

  it('FR-005-16: dialog ima naslov s časom, posledico in fokus na Prekliči', async () => {
    const { user } = renderTrail();

    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent(
      `Kontakti skupine bodo vrnjeni v stanje, kot je bilo ${formatAuditTime(TARGET_TIME, 'sl')}. Spremembe po tej točki ostanejo zabeležene v revizijski sledi, rollback pa bo zapisan kot nov vnos.`,
    );
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Povrni skupino' })).toBeInTheDocument();
  });

  it('FR-005-16: Prekliči in Esc zapreta dialog brez zahtevka; fokus nazaj na gumb vnosa', async () => {
    const { user, api } = renderTrail();
    const item = await entryItem('Drugi');
    const trigger = within(item).getByRole('button', { name: BUTTON });

    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('FR-005-11: potrditev pošlje POST z latestEntryId, pokaže obvestilo, naloži stran 1 in fokusira naslov', async () => {
    let list = trail();
    const { user, api } = renderTrail(PATH, {
      list: (url) => auditPageReply(list)(url),
      rollback: () => {
        list = [
          auditEntry({
            id: entryId(900),
            action: 'ROLLBACK',
            contactName: null,
            target: { entryId: entryId(2), createdAt: TARGET_TIME },
          }),
          ...list,
        ];
        return created(list[0]);
      },
    });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Povrni skupino' }));

    await waitFor(() =>
      expect(api.of('POST', `${LIST_API}/${entryId(2)}/rollback`)).toHaveLength(1),
    );
    expect(api.of('POST', `${LIST_API}/${entryId(2)}/rollback`)[0]?.body).toEqual({
      latestEntryId: NEWEST,
    });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        `Skupina je povrnjena na stanje ${formatAuditTime(TARGET_TIME, 'sl')}.`,
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const lastList = api.of('GET', LIST_API).at(-1);
    expect(lastList?.search.get('page')).toBe('0');
    const first = within(screen.getByRole('list', { name: 'Vnosi revizijske sledi' })).getAllByRole(
      'listitem',
    )[0] as HTMLElement;
    expect(first).toHaveTextContent('povrnil(a) skupino na stanje');
    expect(screen.getByRole('heading', { level: 2, name: 'Revizijska sled' })).toHaveFocus();
  });

  it('FR-005-14: 409 VERSION_CONFLICT zapre dialog, pokaže opozorilo in osveži seznam', async () => {
    const { user, api } = renderTrail(PATH, {
      rollback: () => ({
        status: 409,
        body: { code: 'VERSION_CONFLICT', current: { latestEntryId: entryId(7) } },
      }),
    });
    const dialog = await openDialog(user);
    const requestsBefore = api.of('GET', LIST_API).length;

    await user.click(within(dialog).getByRole('button', { name: 'Povrni skupino' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Revizijska sled se je medtem spremenila.');
    expect(alert).not.toHaveTextContent('VERSION_CONFLICT');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.of('GET', LIST_API).length).toBeGreaterThan(requestsBefore));
  });

  it('FR-005-15: 409 ROLLBACK_NO_CHANGES pokaže opozorilo in osveži seznam', async () => {
    const { user, api } = renderTrail(PATH, {
      rollback: () => ({ status: 409, body: { code: 'ROLLBACK_NO_CHANGES' } }),
    });
    const dialog = await openDialog(user);
    const requestsBefore = api.of('GET', LIST_API).length;

    await user.click(within(dialog).getByRole('button', { name: 'Povrni skupino' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skupina je že v tem stanju – rollback ne bi ničesar spremenil.',
    );
    await waitFor(() => expect(api.of('GET', LIST_API).length).toBeGreaterThan(requestsBefore));
  });

  it('FR-005-18: 500 – trajna napaka nad sledjo; Poskusi znova pošlje enako zahtevo', async () => {
    let fail = true;
    const { user, api } = renderTrail(PATH, {
      rollback: () =>
        fail
          ? { status: 500, body: { code: 'INTERNAL' } }
          : created(auditEntry({ id: entryId(900), action: 'ROLLBACK' })),
    });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Povrni skupino' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Skupine ni bilo mogoče povrniti. Poskusi znova.');
    expect(alert).not.toHaveTextContent('INTERNAL');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    await waitFor(() =>
      expect(api.of('POST', `${LIST_API}/${entryId(2)}/rollback`)).toHaveLength(2),
    );
    const posts = api.of('POST', `${LIST_API}/${entryId(2)}/rollback`);
    expect(posts[1]?.body).toEqual(posts[0]?.body);
  });

  it('FR-005-18: brez povezave – »Ni povezave. Preveri povezavo in poskusi znova.«', async () => {
    const { user } = renderTrail(PATH, { rollback: () => 'network-error' });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Povrni skupino' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ni povezave. Preveri povezavo in poskusi znova.',
    );
  });

  it('FR-005-17: 409 GROUP_ARCHIVED in 403 imata prijazni sporočili', async () => {
    const archived = renderTrail(PATH, {
      rollback: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }),
    });
    const dialog = await openDialog(archived.user);
    await archived.user.click(within(dialog).getByRole('button', { name: 'Povrni skupino' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skupina je arhivirana – rollbacka ni mogoče izvesti.',
    );
    archived.unmount();

    const forbidden = renderTrail(PATH, {
      rollback: () => ({ status: 403, body: { code: 'FORBIDDEN' } }),
    });
    const second = await openDialog(forbidden.user);
    await forbidden.user.click(within(second).getByRole('button', { name: 'Povrni skupino' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Za to dejanje nimaš več pravic.');
  });

  it('FR-005-16: dialog in gumbi v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { user } = renderTrail();
    const list = await screen.findByRole('list', { name: 'Audit trail entries' });
    const item = within(list)
      .getAllByRole('listitem')
      .find((i) => i.textContent?.includes('Drugi')) as HTMLElement;

    await user.click(within(item).getByRole('button', { name: 'Restore the group to this point' }));

    const dialog = await screen.findByRole('dialog', {
      name: `Restore the group to the state of ${formatAuditTime(TARGET_TIME, 'en')}?`,
    });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Restore group' })).toBeInTheDocument();
  });

  it('FR-005-16: odprt dialog brez kršitev axe (sl in en)', async () => {
    const { user, container } = renderTrail();
    await openDialog(user);
    expect((await axe(document.body)).violations).toEqual([]);

    await user.keyboard('{Escape}');
    await i18n.changeLanguage('en');
    const list = await screen.findByRole('list', { name: 'Audit trail entries' });
    const item = within(list)
      .getAllByRole('listitem')
      .find((i) => i.textContent?.includes('Drugi')) as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Restore the group to this point' }));
    await screen.findByRole('dialog');
    expect((await axe(document.body)).violations).toEqual([]);
    expect(container).toBeInTheDocument();
  });
});
