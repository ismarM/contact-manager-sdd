import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail } from '../../test/groupsApi';
import {
  member,
  membersReply,
  type Reply,
  renderMembersApp,
  selfMember,
} from '../../test/membersApi';
import type { Role } from '../groups/types';
import type { Member } from './types';

// Sprememba vloge z dialogom in razrešitev konflikta (FR-007-03, FR-007-04, FR-007-11; plan.md – Key elements;
// design.md 8.11, 8.14).

const PATH = `/groups/${GROUP_ID}/settings`;
const UROS = member(2, { name: 'Urednik Uroš', role: 'EDITOR', version: 4 });
const TRIGGER = 'Dejanja za člana Urednik Uroš';

function render(
  callerRole: Role = 'OWNER',
  options: {
    changeRole?: (groupId: string, id: string, body: unknown) => Reply | Promise<Reply>;
    target?: Member;
    list?: Member[];
  } = {},
) {
  const all = options.list ?? [selfMember(callerRole), options.target ?? UROS];
  return renderMembersApp(
    PATH,
    { list: (url) => membersReply(all)(url), changeRole: options.changeRole },
    { get: () => ({ status: 200, body: groupDetail({ role: callerRole }) }) },
  );
}

async function openDialog(user: ReturnType<typeof render>['user'], name = 'Urednik Uroš') {
  await user.click(await screen.findByRole('button', { name: `Dejanja za člana ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: 'Spremeni vlogo' }));
  return screen.findByRole('dialog', { name: `Spremenim vlogo člana ${name}?` });
}

async function expectNotice(text: string) {
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(text),
  );
}

describe('ChangeRoleDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-007-03: lastnik – dialog z Admin, Urednik, Bralec, trenutna označena, brez Lastnik, fokus na Prekliči', async () => {
    const { user } = render('OWNER');

    const dialog = await openDialog(user);

    const group = within(dialog).getByRole('radiogroup', { name: 'Vloga' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    for (const name of ['Admin', 'Urednik', 'Bralec']) {
      expect(within(group).getByRole('radio', { name })).toBeInTheDocument();
    }
    expect(within(group).getByRole('radio', { name: 'Urednik' })).toBeChecked();
    expect(within(group).queryByRole('radio', { name: 'Lastnik' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Spremeni vlogo' })).toBeInTheDocument();
  });

  it('FR-007-03: admin – samo Urednik in Bralec', async () => {
    const { user } = render('ADMIN');

    const dialog = await openDialog(user);

    const group = within(dialog).getByRole('radiogroup', { name: 'Vloga' });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(within(group).getByRole('radio', { name: 'Urednik' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Bralec' })).toBeInTheDocument();
    expect(within(group).queryByRole('radio', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('FR-007-03: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilec', async () => {
    const { user, members } = render('OWNER');
    const trigger = await screen.findByRole('button', { name: TRIGGER });

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await openDialog(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(members.of('PUT', `/api/groups/${GROUP_ID}/members/${UROS.id}`)).toHaveLength(0);
  });

  it('FR-007-03: potrditev brez spremembe vloge – napaka ob izbiri »Izberi drugo vlogo.«, dialog ostane', async () => {
    const { user } = render('OWNER', {
      changeRole: () => ({
        status: 400,
        body: { code: 'VALIDATION_FAILED', errors: [{ field: 'role', code: 'UNCHANGED' }] },
      }),
    });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('radiogroup', { name: 'Vloga' })).toHaveAccessibleDescription(
        'Izberi drugo vlogo.',
      ),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('FR-007-03: izbira Admin + potrditev – PUT z vlogo in verzijo, obvestilo, osvežen seznam, fokus na naslovu razdelka', async () => {
    const { user, members } = render('OWNER');
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    await expectNotice('Vloga člana Urednik Uroš je spremenjena v Admin.');
    const puts = members.of('PUT', `/api/groups/${GROUP_ID}/members/${UROS.id}`);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({ role: 'ADMIN', version: 4 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(members.of('GET', `/api/groups/${GROUP_ID}/members`).length).toBeGreaterThanOrEqual(2),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Člani' })).toHaveFocus(),
    );
  });

  it('FR-007-04: 409 VERSION_CONFLICT – opozorilo kdo in kdaj, dialog ostane, Uporabi trenutno različico nastavi trenutno vlogo', async () => {
    const changedAt = new Date().toISOString();
    const time = new Intl.DateTimeFormat('sl', { hour: 'numeric', minute: '2-digit' }).format(
      new Date(changedAt),
    );
    const current = member(2, {
      name: 'Urednik Uroš',
      role: 'VIEWER',
      version: 5,
      updatedBy: { name: 'Pia Kos', email: 'pia@primer.si' },
      updatedAt: changedAt,
    });
    const { user, members } = render('OWNER', {
      changeRole: () => ({ status: 409, body: { code: 'VERSION_CONFLICT', current } }),
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(`Vlogo člana je medtem spremenil(a) Pia Kos ob ${time}.`);
    expect(alert.textContent).not.toMatch(/VERSION_CONFLICT/);
    await user.click(within(alert).getByRole('button', { name: 'Uporabi trenutno različico' }));
    expect(within(dialog).getByRole('radio', { name: 'Bralec' })).toBeChecked();
    expect(members.of('PUT', `/api/groups/${GROUP_ID}/members/${UROS.id}`)).toHaveLength(1);
  });

  it('FR-007-04: Shrani moje spremembe ponovno pošlje izbiro nad trenutno verzijo', async () => {
    const current = member(2, {
      name: 'Urednik Uroš',
      role: 'VIEWER',
      version: 5,
      updatedBy: { name: 'Pia Kos', email: 'pia@primer.si' },
      updatedAt: new Date().toISOString(),
    });
    let calls = 0;
    const { user, members } = render('OWNER', {
      changeRole: () => {
        calls += 1;
        return calls === 1
          ? { status: 409, body: { code: 'VERSION_CONFLICT', current } }
          : { status: 200, body: { ...current, role: 'ADMIN', version: 6 } };
      },
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));
    const alert = await within(dialog).findByRole('alert');

    await user.click(within(alert).getByRole('button', { name: 'Shrani moje spremembe' }));

    await waitFor(() =>
      expect(members.of('PUT', `/api/groups/${GROUP_ID}/members/${UROS.id}`)).toHaveLength(2),
    );
    expect(members.of('PUT', `/api/groups/${GROUP_ID}/members/${UROS.id}`)[1]?.body).toEqual({
      role: 'ADMIN',
      version: 5,
    });
    await expectNotice('Vloga člana Urednik Uroš je spremenjena v Admin.');
  });

  it('FR-007-04: konflikt, kjer je trenutna vloga enaka moji izbiri – dialog se zapre brez zahtevka (E1)', async () => {
    const current = member(2, {
      name: 'Urednik Uroš',
      role: 'ADMIN',
      version: 5,
      updatedBy: { name: 'Pia Kos', email: 'pia@primer.si' },
      updatedAt: new Date().toISOString(),
    });
    const { user, members } = render('OWNER', {
      changeRole: () => ({ status: 409, body: { code: 'VERSION_CONFLICT', current } }),
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));
    const alert = await within(dialog).findByRole('alert');

    await user.click(within(alert).getByRole('button', { name: 'Shrani moje spremembe' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(members.of('PUT', `/api/groups/${GROUP_ID}/members/${UROS.id}`)).toHaveLength(1);
  });

  it('FR-007-04: konflikt brez znanega povzročitelja – »izbrisan uporabnik«', async () => {
    const current = member(2, {
      name: 'Urednik Uroš',
      role: 'VIEWER',
      version: 5,
      updatedBy: null,
      updatedAt: new Date().toISOString(),
    });
    const { user } = render('OWNER', {
      changeRole: () => ({ status: 409, body: { code: 'VERSION_CONFLICT', current } }),
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Vlogo člana je medtem spremenil(a) izbrisan uporabnik ob',
    );
  });

  it('FR-007-11: 403 – »Tega člana ne moreš več upravljati.« in osvežitev seznama', async () => {
    const { user, members } = render('ADMIN', {
      changeRole: () => ({ status: 403, body: { code: 'FORBIDDEN' } }),
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Bralec' }));
    const before = members.of('GET', `/api/groups/${GROUP_ID}/members`).length;

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Tega člana ne moreš več upravljati.',
    );
    await waitFor(() =>
      expect(members.of('GET', `/api/groups/${GROUP_ID}/members`).length).toBeGreaterThan(before),
    );
  });

  it('FR-007-11: 404 ob obstoječi skupini – »Člana ni več v skupini.« in osvežitev seznama (F1)', async () => {
    const { user, members } = render('OWNER', { changeRole: () => ({ status: 404 }) });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Bralec' }));
    const before = members.of('GET', `/api/groups/${GROUP_ID}/members`).length;

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .map((a) => a.textContent)
          .join(' '),
      ).toContain('Člana ni več v skupini.'),
    );
    await waitFor(() =>
      expect(members.of('GET', `/api/groups/${GROUP_ID}/members`).length).toBeGreaterThan(before),
    );
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).not.toBeInTheDocument();
  });

  it('FR-007-11: 404 in skupina sama vrne 404 – stran »Te strani ni« (F1)', async () => {
    let groupCalls = 0;
    const { user } = renderMembersApp(
      PATH,
      {
        list: (url) => membersReply([selfMember('OWNER'), UROS])(url),
        changeRole: () => ({ status: 404 }),
      },
      {
        get: () => {
          groupCalls += 1;
          return groupCalls === 1
            ? { status: 200, body: groupDetail({ role: 'OWNER' }) }
            : { status: 404 };
        },
      },
    );
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Bralec' }));

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
  });

  it('FR-007-11: 409 GROUP_ARCHIVED – »Skupina je arhivirana, članov zdaj ni mogoče spreminjati.«', async () => {
    const { user } = render('OWNER', {
      changeRole: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }),
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Bralec' }));

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Skupina je arhivirana, članov zdaj ni mogoče spreminjati.',
    );
  });

  it.each([
    ['strežnik ne uspe', { status: 500 }, 'Vloge člana ni bilo mogoče spremeniti. Poskusi znova.'],
    ['ni povezave', 'network-error' as const, 'Ni povezave. Preveri povezavo in poskusi znova.'],
  ])('FR-007-11: %s – opozorilo brez tehničnih kod', async (_name, reply, message) => {
    const { user } = render('OWNER', { changeRole: () => reply });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Bralec' }));

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni vlogo' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert.textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
  });

  it.each(['sl', 'en'] as const)(
    'FR-007-03 SC-006: dialog je dostopen (axe) in dvojezičen – %s',
    async (language) => {
      await i18n.changeLanguage(language);
      const { user } = render('OWNER');
      const name = 'Urednik Uroš';
      await user.click(
        await screen.findByRole('button', {
          name: language === 'sl' ? `Dejanja za člana ${name}` : `Actions for member ${name}`,
        }),
      );
      await user.click(
        await screen.findByRole('menuitem', {
          name: language === 'sl' ? 'Spremeni vlogo' : 'Change role',
        }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: language === 'sl' ? `Spremenim vlogo člana ${name}?` : `Change the role of ${name}?`,
      });

      expect(
        within(dialog).getByRole('button', { name: language === 'sl' ? 'Prekliči' : 'Cancel' }),
      ).toHaveFocus();
      expect((await axe(dialog)).violations).toEqual([]);
    },
  );

  it('FR-007-03 FR-007-04 FR-007-11: angleška besedila (enaka vloga, konflikt, 403)', async () => {
    await i18n.changeLanguage('en');
    const current = member(2, {
      name: 'Urednik Uroš',
      role: 'VIEWER',
      version: 5,
      updatedBy: { name: 'Pia Kos', email: 'pia@primer.si' },
      updatedAt: new Date().toISOString(),
    });
    const replies: Reply[] = [
      {
        status: 400,
        body: { code: 'VALIDATION_FAILED', errors: [{ field: 'role', code: 'UNCHANGED' }] },
      },
      { status: 409, body: { code: 'VERSION_CONFLICT', current } },
      { status: 403, body: { code: 'FORBIDDEN' } },
    ];
    const { user } = render('OWNER', { changeRole: () => replies.shift() ?? { status: 500 } });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for member Urednik Uroš' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Change role' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the role of Urednik Uroš?' });
    const confirm = () => user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    await confirm();
    await waitFor(() =>
      expect(within(dialog).getByRole('radiogroup', { name: 'Role' })).toHaveAccessibleDescription(
        'Choose a different role.',
      ),
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));
    await confirm();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "The member's role was changed in the meantime by Pia Kos at",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Use current version' }));
    expect(within(dialog).getByRole('radio', { name: 'Viewer' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));
    await confirm();
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'You can no longer manage this member.',
      ),
    );
  });

  it.each([
    ['500', { status: 500 }, "The member's role could not be changed. Please try again."],
    [
      'GROUP_ARCHIVED',
      { status: 409, body: { code: 'GROUP_ARCHIVED' } },
      'The group is archived, members cannot be changed now.',
    ],
    [
      'brez povezave',
      'network-error' as const,
      "You're offline. Check your connection and try again.",
    ],
  ])('FR-007-11: angleško sporočilo napake – %s', async (_name, reply, message) => {
    await i18n.changeLanguage('en');
    const { user } = render('OWNER', { changeRole: () => reply });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for member Urednik Uroš' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Change role' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the role of Urednik Uroš?' });
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));

    await user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  });

  it('FR-007-03 FR-007-11: angleško obvestilo uspeha', async () => {
    await i18n.changeLanguage('en');
    const { user } = render('OWNER', {
      target: member(2, { name: 'Ana Novak', role: 'EDITOR', version: 4 }),
      changeRole: () => ({
        status: 200,
        body: member(2, { name: 'Ana Novak', role: 'ADMIN', version: 5 }),
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Actions for member Ana Novak' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Change role' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the role of Ana Novak?' });
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));

    await user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent(
        "Ana Novak's role was changed to Admin.",
      ),
    );
  });

  it('FR-007-04 FR-007-11: angleško sporočilo 404 ob obstoječi skupini', async () => {
    await i18n.changeLanguage('en');
    const { user } = render('OWNER', { changeRole: () => ({ status: 404 }) });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for member Urednik Uroš' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Change role' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the role of Urednik Uroš?' });
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));

    await user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .map((a) => a.textContent)
          .join(' '),
      ).toContain('This member is no longer in the group.'),
    );
  });

  it('FR-007-04 FR-007-11: angleški konflikt brez znanega povzročitelja – »a deleted user«', async () => {
    await i18n.changeLanguage('en');
    const current = member(2, {
      name: 'Urednik Uroš',
      role: 'VIEWER',
      version: 5,
      updatedBy: null,
      updatedAt: new Date().toISOString(),
    });
    const { user } = render('OWNER', {
      changeRole: () => ({ status: 409, body: { code: 'VERSION_CONFLICT', current } }),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for member Urednik Uroš' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Change role' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the role of Urednik Uroš?' });
    await user.click(within(dialog).getByRole('radio', { name: 'Admin' }));

    await user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "The member's role was changed in the meantime by a deleted user at",
    );
  });
});
