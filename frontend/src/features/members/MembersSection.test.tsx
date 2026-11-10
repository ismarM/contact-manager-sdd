import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail } from '../../test/groupsApi';
import {
  manyMembers,
  member,
  membersReply,
  renderMembersApp,
  selfMember,
} from '../../test/membersApi';
import type { Role } from '../groups/types';
import type { Member } from './types';

// Razdelek *Člani* v *Nastavitvah*: seznam, meni dejanj, paginacija, stanja (FR-007-01, FR-007-02, FR-007-10, FR-007-11;
// plan.md – Key elements; design.md 8.6, 8.9, 9.7).

const PATH = `/groups/${GROUP_ID}/settings`;

function roster(role: Role): Member[] {
  const you = (r: Role) =>
    r === role ? { self: true, name: 'Ana Novak', email: 'ana@primer.si' } : {};
  const canManage = (target: Role) =>
    (role === 'OWNER' && target !== 'OWNER') ||
    (role === 'ADMIN' && (target === 'EDITOR' || target === 'VIEWER'));
  return (['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const).map((r, i) =>
    member(i + 1, {
      role: r,
      name:
        r === 'OWNER'
          ? 'Lojze Mlakar'
          : r === 'ADMIN'
            ? 'Alenka Kos'
            : r === 'EDITOR'
              ? 'Uroš Zupan'
              : 'Boris Kranjc',
      canManage: r !== role && canManage(r),
      ...you(r),
    }),
  );
}

function render(
  role: Role,
  options: {
    archived?: boolean;
    permanent?: boolean;
    members?: Member[];
    deletedOwner?: boolean;
  } = {},
) {
  const all = options.members ?? roster(role);
  return renderMembersApp(
    PATH,
    { list: (url) => membersReply(all, { deletedOwner: options.deletedOwner })(url) },
    {
      get: () => ({
        status: 200,
        body: groupDetail({
          role,
          archived: options.archived ?? false,
          permanentlyArchived: options.permanent ?? false,
        }),
      }),
    },
  );
}

const section = async () => within(await screen.findByRole('region', { name: 'Člani' }));

describe('MembersSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-007-01: bralec vidi preglednico Član · E-naslov · Vloga · Dejanja z vsemi štirimi člani po vlogi', async () => {
    render('VIEWER');

    const members = await section();
    expect(members.getByRole('heading', { level: 2, name: 'Člani' })).toBeInTheDocument();
    const table = await members.findByRole('table', { name: 'Člani' });
    for (const name of ['Član', 'E-naslov', 'Vloga', 'Dejanja']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByRole('cell', { name: 'Lojze Mlakar' })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('cell', { name: 'clan001@primer.si' })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('cell', { name: 'Lastnik' })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('cell', { name: 'Admin' })).toBeInTheDocument();
    expect(within(rows[2]!).getByRole('cell', { name: 'Urednik' })).toBeInTheDocument();
    expect(within(rows[3]!).getByRole('cell', { name: 'Bralec' })).toBeInTheDocument();
    expect(within(rows[3]!).getByRole('cell', { name: 'Ana Novak (ti)' })).toBeInTheDocument();
    expect(within(rows[3]!).getByRole('cell', { name: 'ana@primer.si' })).toBeInTheDocument();
    expect(rows[0]).not.toHaveTextContent('(ti)');
  });

  it('FR-007-01: razdelek je med Podatki skupine in Povabi člana', async () => {
    render('ADMIN');

    await section();
    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(
      (h) => h.textContent,
    );
    const iData = headings.indexOf('Podatki skupine');
    const iMembers = headings.indexOf('Člani');
    const iInvite = await waitFor(() => {
      const index = screen
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
        .indexOf('Povabi člana');
      expect(index).toBeGreaterThan(-1);
      return index;
    });
    expect(iData).toBeLessThan(iMembers);
    expect(iMembers).toBeLessThan(iInvite);
  });

  it.each(['VIEWER', 'EDITOR'] as const)('FR-007-02: %s – brez menijev dejanj', async (role) => {
    render(role);

    await section();
    await screen.findByRole('table', { name: 'Člani' });
    expect(screen.queryByRole('button', { name: /^Dejanja za člana/ })).not.toBeInTheDocument();
  });

  it('FR-007-02: admin ima meni samo ob uredniku in bralcu – ne ob sebi, drugem adminu ali lastniku', async () => {
    const all = [
      ...roster('ADMIN'),
      member(5, { role: 'ADMIN', name: 'Drugi Admin', canManage: false }),
    ];
    render('ADMIN', { members: all });

    await section();
    await screen.findByRole('table', { name: 'Člani' });
    expect(screen.getByRole('button', { name: 'Dejanja za člana Uroš Zupan' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Dejanja za člana Boris Kranjc' }),
    ).toBeInTheDocument();
    for (const name of ['Lojze Mlakar', 'Ana Novak', 'Drugi Admin']) {
      expect(
        screen.queryByRole('button', { name: `Dejanja za člana ${name}` }),
      ).not.toBeInTheDocument();
    }
  });

  it('FR-007-02: lastnik ima meni ob adminu, uredniku in bralcu – ne ob sebi', async () => {
    render('OWNER');

    await section();
    await screen.findByRole('table', { name: 'Člani' });
    for (const name of ['Alenka Kos', 'Uroš Zupan', 'Boris Kranjc']) {
      expect(screen.getByRole('button', { name: `Dejanja za člana ${name}` })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: 'Dejanja za člana Ana Novak' }),
    ).not.toBeInTheDocument();
  });

  it('FR-007-02: meni vsebuje Spremeni vlogo in Odstrani iz skupine, Esc ga zapre in vrne fokus', async () => {
    const { user } = render('OWNER');
    await section();
    const trigger = await screen.findByRole('button', { name: 'Dejanja za člana Uroš Zupan' });

    await user.click(trigger);

    expect(await screen.findByRole('menuitem', { name: 'Spremeni vlogo' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Odstrani iz skupine' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('FR-007-02: meni deluje s tipkovnico (Enter odpre, puščica in Enter izbereta dejanje)', async () => {
    const { user } = render('OWNER');
    const trigger = await screen.findByRole('button', { name: 'Dejanja za člana Uroš Zupan' });
    trigger.focus();

    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it.each(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const)(
    'FR-007-01 FR-007-02 FR-007-10: arhivirana skupina – %s vidi seznam, brez menijev dejanj',
    async (role) => {
      render(role, {
        archived: true,
        // strežnik v arhivirani skupini pošlje canManage: false; vmesnik mora meni skriti tudi, če bi pisalo true
        members: roster(role).map((m) => ({ ...m, canManage: m.role !== role })),
      });

      await section();
      const table = await screen.findByRole('table', { name: 'Člani' });
      expect(within(table).getAllByRole('row')).toHaveLength(5);
      expect(screen.queryByRole('button', { name: /^Dejanja za člana/ })).not.toBeInTheDocument();
    },
  );

  it('FR-007-01: trajno arhivirana skupina – lastnik je »izbrisan uporabnik« brez e-naslova in dejanj', async () => {
    const all = [
      member(2, { role: 'ADMIN', name: 'Alenka Kos', canManage: false }),
      selfMember('VIEWER'),
    ];
    render('VIEWER', { archived: true, permanent: true, members: all, deletedOwner: true });

    await section();
    const table = await screen.findByRole('table', { name: 'Člani' });
    const deleted = within(table).getByRole('row', { name: /izbrisan uporabnik/ });
    expect(deleted).toHaveTextContent('Lastnik');
    expect(deleted).not.toHaveTextContent('@');
    expect(within(deleted).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dejanja za člana/ })).not.toBeInTheDocument();
  });

  it('FR-007-01: seznam je paginiran (25 / 50 / 100), Naslednja zahteva naslednjo stran', async () => {
    const all = [selfMember(), ...manyMembers(29, () => ({ canManage: false }))];
    const { user, members } = render('OWNER', { members: all });

    const nav = await screen.findByRole('navigation', { name: 'Strani rezultatov: Člani' });
    expect(within(nav).getByRole('status')).toHaveTextContent('1–25 od 30');
    await user.click(within(nav).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() =>
      expect(
        members
          .of('GET', `/api/groups/${GROUP_ID}/members`)
          .some((r) => r.search.get('page') === '1' && r.search.get('size') === '25'),
      ).toBe(true),
    );
    await user.selectOptions(within(nav).getByRole('combobox', { name: 'Velikost strani' }), '50');
    await waitFor(() =>
      expect(
        members
          .of('GET', `/api/groups/${GROUP_ID}/members`)
          .some((r) => r.search.get('size') === '50'),
      ).toBe(true),
    );
  });

  it('FR-007-01: nalaganje prikaže »Nalagam…«, napaka »Poskusi znova« ponovi zahtevek', async () => {
    let attempts = 0;
    const { user, members } = renderMembersApp(
      PATH,
      {
        list: (url) => {
          attempts += 1;
          return attempts === 1 ? { status: 500 } : membersReply([selfMember()])(url);
        },
      },
      { get: () => ({ status: 200, body: groupDetail({ role: 'OWNER' }) }) },
    );

    const alert = await within(await screen.findByRole('region', { name: 'Člani' })).findByRole(
      'alert',
    );
    expect(alert).toHaveTextContent('Članov ni bilo mogoče naložiti. Poskusi znova.');
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(await screen.findByRole('table', { name: 'Člani' })).toBeInTheDocument();
    expect(members.of('GET', `/api/groups/${GROUP_ID}/members`).length).toBeGreaterThanOrEqual(2);
  });

  it('FR-007-01: med nalaganjem je viden status »Nalagam…«', async () => {
    renderMembersApp(
      PATH,
      {
        list: async (url) => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          return membersReply([selfMember()])(url);
        },
      },
      { get: () => ({ status: 200, body: groupDetail({ role: 'OWNER' }) }) },
    );

    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Nalagam…'))).toBe(
        true,
      ),
    );
    expect(await screen.findByRole('table', { name: 'Člani' })).toBeInTheDocument();
  });

  it.each(['sl', 'en'] as const)('FR-007-01 SC-006: axe brez kršitev v %s', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = render('OWNER');

    await screen.findByRole('table', { name: language === 'sl' ? 'Člani' : 'Members' });

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-007-01: angleški vmesnik – imena stolpcev in vloge', async () => {
    await i18n.changeLanguage('en');
    render('VIEWER');

    const table = await screen.findByRole('table', { name: 'Members' });
    for (const name of ['Member', 'Email', 'Role', 'Actions']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(within(table).getAllByRole('row')[4]).toHaveTextContent('Ana Novak (you)');
    expect(
      within(within(table).getAllByRole('row')[1]!).getByRole('cell', { name: 'Owner' }),
    ).toBeInTheDocument();
  });

  it('FR-007-01 FR-007-11: angleški status »Loading…« in napaka nalaganja', async () => {
    await i18n.changeLanguage('en');
    let attempts = 0;
    const { user } = renderMembersApp(
      PATH,
      {
        list: async (url) => {
          attempts += 1;
          if (attempts === 1) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            return { status: 500 };
          }
          return membersReply([selfMember()])(url);
        },
      },
      { get: () => ({ status: 200, body: groupDetail({ role: 'OWNER' }) }) },
    );

    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Loading…'))).toBe(
        true,
      ),
    );
    const alert = await within(await screen.findByRole('region', { name: 'Members' })).findByRole(
      'alert',
    );
    expect(alert).toHaveTextContent('Members could not be loaded. Please try again.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Members' })).toBeInTheDocument();
  });

  it('FR-007-01 FR-007-11: angleška vrstica »deleted user« z vlogo Owner', async () => {
    await i18n.changeLanguage('en');
    const all = [
      member(2, { role: 'ADMIN', name: 'Alenka Kos', canManage: false }),
      selfMember('VIEWER'),
    ];
    render('VIEWER', { archived: true, permanent: true, members: all, deletedOwner: true });

    const table = await screen.findByRole('table', { name: 'Members' });
    const deleted = within(table).getByRole('row', { name: /deleted user/ });
    expect(deleted).toHaveTextContent('Owner');
    expect(deleted).not.toHaveTextContent('@');
  });

  it.each(['sl', 'en'] as const)(
    'FR-007-01: seznam članov pošlje lang=%s (razvrščanje po jeziku vmesnika)',
    async (language) => {
      await i18n.changeLanguage(language);
      const { members } = render('OWNER');

      await screen.findByRole('table', { name: language === 'sl' ? 'Člani' : 'Members' });

      expect(
        members
          .of('GET', `/api/groups/${GROUP_ID}/members`)
          .every((r) => r.search.get('lang') === language),
      ).toBe(true);
      expect(members.of('GET', `/api/groups/${GROUP_ID}/members`).length).toBeGreaterThan(0);
    },
  );
});
