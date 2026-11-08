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
  GROUP_ID,
  renderAuditApp,
} from '../../test/auditApi';

// Točka »Začetno stanje« (FR-005-20): zadnji element nefiltrirane sledi, ne šteje v paginacijo (D-26).

const PATH = `/groups/${GROUP_ID}/audit`;
const BUTTON = 'Povrni skupino na to točko';
const ALL = auditEntries(40);

const initialItem = async () => {
  const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
  return within(list)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes('Začetno stanje'));
};

describe('AuditInitialState', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-005-20: zadnja stran nefiltrirane sledi ima na koncu »Začetno stanje« z opisom in gumbom; paginacija ga ne šteje', async () => {
    renderAuditApp(`${PATH}?page=2`, { role: 'ADMIN', handlers: { list: auditPageReply(ALL) } });

    const list = await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    const items = within(list).getAllByRole('listitem');
    const last = items.at(-1) as HTMLElement;
    expect(last).toHaveTextContent('Začetno stanje');
    expect(last).toHaveTextContent('Stanje kontaktov pred prvim vnosom v revizijski sledi.');
    expect(within(last).getByRole('button', { name: BUTTON })).toBeVisible();
    expect(items).toHaveLength(16);
    expect(
      within(screen.getByRole('navigation', { name: 'Strani rezultatov' })).getByRole('status'),
    ).toHaveTextContent('26–40 od 40');
  });

  it('FR-005-20: prva stran, vmesne strani in filtrirana sled nimajo te točke', async () => {
    const first = renderAuditApp(PATH, { role: 'ADMIN', handlers: { list: auditPageReply(ALL) } });
    expect(await initialItem()).toBeUndefined();
    first.unmount();

    const filtered = renderAuditApp(`${PATH}?action=DELETE`, {
      role: 'ADMIN',
      handlers: { list: auditPageReply(ALL) },
    });
    await screen.findByRole('list', { name: 'Vnosi revizijske sledi' });
    expect(await initialItem()).toBeUndefined();
    filtered.unmount();
  });

  it('FR-005-20: prazna sled nima točke Začetno stanje', async () => {
    renderAuditApp(PATH, { role: 'ADMIN' });

    await screen.findByRole('heading', { level: 3, name: 'V revizijski sledi še ni vnosov.' });
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument();
  });

  it('FR-005-20: potrditev pošlje POST initial-state/rollback z latestEntryId in pokaže obvestilo', async () => {
    const { user, api } = renderAuditApp(`${PATH}?page=2`, {
      role: 'ADMIN',
      handlers: {
        list: auditPageReply(ALL),
        rollbackInitial: () =>
          created(auditEntry({ id: entryId(900), action: 'ROLLBACK', targetInitial: true })),
      },
    });
    const item = (await initialItem()) as HTMLElement;

    await user.click(within(item).getByRole('button', { name: BUTTON }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Povrnem skupino na začetno stanje?',
    });
    expect(dialog).toHaveTextContent(
      'Kontakti skupine bodo vrnjeni v stanje pred prvim vnosom v revizijski sledi.',
    );
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Povrni skupino' }));

    await waitFor(() =>
      expect(api.of('POST', `/api/groups/${GROUP_ID}/audit/initial-state/rollback`)).toHaveLength(
        1,
      ),
    );
    expect(api.of('POST', `/api/groups/${GROUP_ID}/audit/initial-state/rollback`)[0]?.body).toEqual(
      { latestEntryId: entryId(40) },
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Skupina je povrnjena na začetno stanje.',
      ),
    );
  });

  it('FR-005-20: točka in dialog v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { user } = renderAuditApp(`${PATH}?page=2`, {
      role: 'ADMIN',
      handlers: { list: auditPageReply(ALL) },
    });
    const list = await screen.findByRole('list', { name: 'Audit trail entries' });
    const last = within(list).getAllByRole('listitem').at(-1) as HTMLElement;

    expect(last).toHaveTextContent('Initial state');
    expect(last).toHaveTextContent('The contacts as they were before the first audit trail entry.');
    await user.click(within(last).getByRole('button', { name: 'Restore the group to this point' }));
    expect(
      await screen.findByRole('dialog', { name: 'Restore the group to the initial state?' }),
    ).toBeInTheDocument();
  });

  it('FR-005-20: točka in odprt dialog brez kršitev axe (sl in en)', async () => {
    const { user, container } = renderAuditApp(`${PATH}?page=2`, {
      role: 'ADMIN',
      handlers: { list: auditPageReply(ALL) },
    });
    const item = (await initialItem()) as HTMLElement;
    expect((await axe(container)).violations).toEqual([]);

    await user.click(within(item).getByRole('button', { name: BUTTON }));
    await screen.findByRole('dialog');
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
