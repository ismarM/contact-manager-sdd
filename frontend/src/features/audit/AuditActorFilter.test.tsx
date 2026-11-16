import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  auditEntry,
  auditPageReply,
  entryId,
  GROUP_ID,
  ok,
  renderAuditApp,
  type AuditAppOptions,
} from '../../test/auditApi';
import { CONTACT_ID } from '../../test/contactsApi';
import { actor, ANA, BORIS, tr } from '../../test/historyApi';
import type { ActorList, AuditEntry, AuditPage } from './types';

// Filter sledi po izvajalcu (FR-015-01 … -04; design.md 8.7, 8.9, 8.15).

const PATH = `/groups/${GROUP_ID}/audit`;
const LIST_API = `/api/groups/${GROUP_ID}/audit`;
const ANA_TOKEN = '0193c4a2-7a1f-7c3e-9b1a-aaaaaaaa0001';
const BORIS_TOKEN = '0193c4a2-7a1f-7c3e-9b1a-aaaaaaaa0002';
const CENE_TOKEN = '0193c4a2-7a1f-7c3e-9b1a-aaaaaaaa0003';
const UNKNOWN_TOKEN = '0193c4a2-7a1f-7c3e-9b1a-aaaaaaaa00ff';

const ACTORS: ActorList = {
  items: [
    actor(ANA_TOKEN, 'MEMBER', ANA),
    actor(BORIS_TOKEN, 'MEMBER', BORIS),
    actor(CENE_TOKEN, 'FORMER', { name: 'Cene Zupan', email: 'cene@primer.si' }),
    actor('deleted', 'DELETED', null),
  ],
};

const TOKEN_OF: Record<string, string> = {
  [ANA.email]: ANA_TOKEN,
  [BORIS.email]: BORIS_TOKEN,
  'cene@primer.si': CENE_TOKEN,
};

/** Pet vnosov in točka *Začetno stanje* nefiltrirane sledi. */
const ALL_ITEMS = 6;

const ENTRIES: AuditEntry[] = [
  auditEntry({
    id: entryId(5),
    createdAt: '2026-10-12T12:05:00Z',
    action: 'DELETE',
    contactName: 'Peti',
  }),
  auditEntry({
    id: entryId(4),
    createdAt: '2026-10-12T12:04:00Z',
    actor: BORIS,
    action: 'UPDATE',
    contactName: 'Četrti',
  }),
  auditEntry({
    id: entryId(3),
    createdAt: '2026-10-12T12:03:00Z',
    actor: { name: 'Cene Zupan', email: 'cene@primer.si' },
    contactName: 'Tretji',
  }),
  auditEntry({
    id: entryId(2),
    createdAt: '2026-10-12T12:02:00Z',
    actor: null,
    contactName: 'Drugi',
  }),
  auditEntry({
    id: entryId(1),
    createdAt: '2026-10-12T12:01:00Z',
    actor: ANA,
    contactName: 'Prvi',
  }),
];

/** Strežnik sledi z izvajalci: `actor` (žeton ali `deleted`) in `action` režeta seznam, neznan žeton da prazen seznam. */
function listReply(url: URL) {
  const token = url.searchParams.get('actor');
  const actions = url.searchParams.getAll('action');
  const known = token === null || token === 'deleted' || Object.values(TOKEN_OF).includes(token);
  const matching = ENTRIES.filter((entry) => {
    const entryToken = entry.actor ? TOKEN_OF[entry.actor.email] : 'deleted';
    return (
      known &&
      (token === null || entryToken === token) &&
      (actions.length === 0 || actions.includes(entry.action))
    );
  });
  const filter = ACTORS.items.find((a) => a.id === token) ?? null;
  const body: AuditPage = {
    total: matching.length,
    page: 0,
    size: 25,
    items: matching,
    latestEntryId: entryId(5),
    contactFilter: null,
    actorFilter: filter,
  };
  return ok(body);
}

function render(path = PATH, options: AuditAppOptions = {}) {
  return renderAuditApp(path, {
    role: 'VIEWER',
    ...options,
    handlers: { list: listReply, actors: () => ok(ACTORS), ...options.handlers },
  });
}

const entries = async () =>
  within(await screen.findByRole('list', { name: tr('audit.list.entries') })).getAllByRole(
    'listitem',
  );

async function openPanel(user: ReturnType<typeof render>['user']) {
  await screen.findByRole('list', { name: tr('audit.list.entries') });
  await user.click(screen.getByRole('button', { name: /^Filtri/ }));
  return screen.findByRole('combobox', { name: tr('audit.filters.actorLabel') });
}

describe('AuditActorFilter', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-015-03: izbira ponuja izvajalce te sledi – člane, nekdanje člane (z oznako) in izbrisan uporabnik', async () => {
    const { user, api } = render();

    const select = await openPanel(user);

    expect(api.of('GET', `${LIST_API}/actors`)).toHaveLength(1);
    const members = within(select).getByRole('group', { name: tr('audit.filters.actorMembers') });
    expect(
      within(members)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Ana Novak', 'Boris Kranjc']);
    const former = within(select).getByRole('group', { name: tr('audit.filters.actorFormer') });
    expect(within(former).getByRole('option')).toHaveTextContent(
      tr('audit.filters.actorFormerName', { name: 'Cene Zupan' }),
    );
    expect(within(select).getByRole('option', { name: tr('audit.list.deletedUser') })).toHaveValue(
      'deleted',
    );
    expect(
      within(select).getByRole('option', { name: tr('audit.filters.actorAll') }),
    ).toBeVisible();
  });

  it('FR-015-01: izbira izvajalca in Uporabi filtre zapišeta actor v pot, poslata zahtevek in pokažeta odstranljivo oznako', async () => {
    const { user, api } = render();
    const select = await openPanel(user);

    await user.selectOptions(select, BORIS_TOKEN);
    await user.click(screen.getByRole('button', { name: tr('audit.filters.apply') }));

    await waitFor(() => expect(window.location.search).toBe(`?actor=${BORIS_TOKEN}`));
    await waitFor(() =>
      expect(api.of('GET', LIST_API).at(-1)?.search.get('actor')).toBe(BORIS_TOKEN),
    );
    const items = await waitFor(async () => {
      const list = await entries();
      expect(list).toHaveLength(1);
      return list;
    });
    expect(items[0]).toHaveTextContent('Boris Kranjc uredil(a) kontakt Četrti');
    expect(await screen.findByRole('button', { name: 'Filtri (1)' })).toBeVisible();

    await user.click(
      await screen.findByRole('button', {
        name: tr('audit.filters.removeActor', { name: 'Boris Kranjc' }),
      }),
    );
    await waitFor(() => expect(window.location.search).toBe(''));
    await waitFor(async () => expect(await entries()).toHaveLength(ALL_ITEMS));
  });

  it('FR-015-01: filter ostane ob osvežitvi – oznaka z imenom iz odgovora, izbira v panelu je izbrana', async () => {
    const { user } = render(`${PATH}?actor=${CENE_TOKEN}`);

    const chip = await screen.findByRole('button', {
      name: tr('audit.filters.removeActor', { name: 'Cene Zupan' }),
    });
    expect(chip).toHaveTextContent(tr('audit.filters.chipActor', { name: 'Cene Zupan' }));
    expect(await entries()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Filtri (1)' }));
    expect(
      await screen.findByRole('combobox', { name: tr('audit.filters.actorLabel') }),
    ).toHaveValue(CENE_TOKEN);
  });

  it('FR-015-03: izbrisan uporabnik – ena postavka, filter pokaže njegove vnose', async () => {
    const { api } = render(`${PATH}?actor=deleted`);

    const items = await entries();
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(`${tr('audit.list.deletedUser')} dodal(a) kontakt Drugi`);
    expect(api.of('GET', LIST_API)[0]?.search.get('actor')).toBe('deleted');
    expect(
      screen.getByRole('button', {
        name: tr('audit.filters.removeActor', { name: tr('audit.list.deletedUser') }),
      }),
    ).toBeVisible();
  });

  it('FR-015-02: izvajalec, vrsta dejanja in kontakt skupaj – vsi trije v zahtevku in v poti, števec 3', async () => {
    const { api } = render(
      `${PATH}?actor=${BORIS_TOKEN}&action=UPDATE&action=DELETE&contact=${CONTACT_ID}`,
    );

    await entries();
    const search = api.of('GET', LIST_API)[0]?.search;
    expect(search?.get('actor')).toBe(BORIS_TOKEN);
    expect(search?.getAll('action')).toEqual(['UPDATE', 'DELETE']);
    expect(search?.get('contact')).toBe(CONTACT_ID);
    expect(screen.getByRole('button', { name: 'Filtri (4)' })).toBeVisible();
  });

  it('FR-015-02: sprememba izvajalca ohrani druge filtre', async () => {
    const { user } = render(`${PATH}?action=UPDATE&actor=${BORIS_TOKEN}`);
    await entries();

    await user.click(
      screen.getByRole('button', {
        name: tr('audit.filters.removeActor', { name: 'Boris Kranjc' }),
      }),
    );

    await waitFor(() => expect(window.location.search).toBe('?action=UPDATE'));
  });

  it('FR-015-04: izvajalec brez vnosov (neznan žeton) – prazno stanje s Počisti filtre, brez razkritja', async () => {
    const { user } = render(`${PATH}?actor=${UNKNOWN_TOKEN}`);

    expect(
      await screen.findByRole('heading', { level: 3, name: tr('audit.list.emptyFiltered') }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: tr('audit.filters.removeActor', { name: tr('audit.filters.unknownActor') }),
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('audit.list.clearFilters') }));

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await entries()).toHaveLength(ALL_ITEMS);
  });

  it('FR-015-01: neveljavna oblika žetona v poti – prazno stanje brez zahtevka', async () => {
    const { api } = render(`${PATH}?actor=foo`);

    expect(
      await screen.findByRole('heading', { level: 3, name: tr('audit.list.emptyFiltered') }),
    ).toBeVisible();
    expect(api.of('GET', LIST_API)).toHaveLength(0);
  });

  it('FR-015-04: rollback iz filtriranega pogleda pošlje latestEntryId celotne sledi', async () => {
    const { user, api } = render(`${PATH}?actor=${BORIS_TOKEN}`, { role: 'ADMIN' });
    const [item] = await entries();

    await user.click(
      within(item as HTMLElement).getByRole('button', { name: tr('audit.list.rollbackButton') }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: tr('audit.rollback.confirm'),
      }),
    );

    await waitFor(() => expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(1));
    expect(api.requests.find((r) => r.method === 'POST')?.body).toEqual({
      latestEntryId: entryId(5),
    });
  });

  it('FR-015-19: neuspel seznam izvajalcev – sporočilo in Poskusi znova', async () => {
    let attempt = 0;
    const { user } = render(PATH, {
      handlers: {
        actors: () => {
          attempt += 1;
          return attempt === 1 ? { status: 500 } : ok(ACTORS);
        },
      },
    });
    await screen.findByRole('list', { name: tr('audit.list.entries') });
    await user.click(screen.getByRole('button', { name: /^Filtri/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('audit.filters.actorsFailed'));
    await user.click(within(alert).getByRole('button', { name: tr('audit.filters.actorsRetry') }));

    expect(
      await screen.findByRole('combobox', { name: tr('audit.filters.actorLabel') }),
    ).toBeVisible();
  });

  it('FR-015-20: odprt panel z izbiro izvajalca brez kršitev axe (sl in en)', async () => {
    const { user, container } = render(`${PATH}?actor=${ANA_TOKEN}`);
    await screen.findByRole('list', { name: tr('audit.list.entries') });
    await user.click(screen.getByRole('button', { name: 'Filtri (1)' }));
    await screen.findByRole('combobox', { name: tr('audit.filters.actorLabel') });

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-015-01: filter po izvajalcu v angleščini', async () => {
    await i18n.changeLanguage('en');
    const { user } = render(`${PATH}?actor=${BORIS_TOKEN}`);
    await screen.findByRole('list', { name: tr('audit.list.entries') });

    expect(screen.getByRole('button', { name: 'Remove filter Actor: Boris Kranjc' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Filters (1)' }));
    const select = await screen.findByRole('combobox', { name: 'Actor' });
    expect(within(select).getByRole('option', { name: 'All actors' })).toBeVisible();
    expect(within(select).getByRole('group', { name: 'Former members' })).toBeVisible();
    expect(
      within(select).getByRole('option', { name: 'Cene Zupan (former member)' }),
    ).toBeVisible();
  });

  it('FR-015-04: privzeti zahtevek brez filtra izvajalca nima parametra actor', async () => {
    const { api } = render(PATH, { handlers: { list: auditPageReply(ENTRIES) } });

    await entries();
    expect(api.of('GET', LIST_API)[0]?.search.has('actor')).toBe(false);
  });
});
