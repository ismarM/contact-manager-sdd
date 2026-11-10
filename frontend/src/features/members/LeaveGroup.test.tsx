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

// Zapuščanje skupine in razlagi namesto gumba (FR-007-06, FR-007-07, FR-007-08, FR-007-11; plan.md – Key elements;
// design.md 8.11, 9.7). Obstoječi GroupManagementSection.test (003) mora ostati zelen brez sprememb.

const PATH = `/groups/${GROUP_ID}/settings`;
const OWNER_INFO =
  'Kot lastnik lahko skupino zapustiš šele, ko preneseš lastništvo na drugega člana.';
const LAST_INFO = 'Kot zadnji član skupine je ne moreš zapustiti, lahko jo le izbrišeš.';

function render(
  role: Role,
  options: {
    archived?: boolean;
    permanent?: boolean;
    members?: Member[];
    leave?: (groupId: string) => Reply | Promise<Reply>;
    groupGet?: () => Reply;
  } = {},
) {
  const all = options.members ?? [
    selfMember(role),
    member(2, { name: 'Drug Član', canManage: false }),
  ];
  return renderMembersApp(
    PATH,
    { list: (url) => membersReply(all)(url), leave: options.leave },
    {
      get:
        options.groupGet ??
        (() => ({
          status: 200,
          body: groupDetail({
            role,
            archived: options.archived ?? false,
            permanentlyArchived: options.permanent ?? false,
          }),
        })),
    },
  );
}

const management = async () => screen.findByRole('region', { name: 'Upravljanje skupine' });

async function openLeave(user: ReturnType<typeof render>['user']) {
  await management();
  await user.click(await screen.findByRole('button', { name: 'Zapusti skupino' }));
  return screen.findByRole('dialog', { name: 'Zapustim skupino Projekt FERI?' });
}

describe('LeaveGroup', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it.each(['ADMIN', 'EDITOR', 'VIEWER'] as const)(
    'FR-007-06: %s vidi Zapusti skupino; dialog z vprašanjem, posledico in fokusom na Prekliči',
    async (role) => {
      const { user } = render(role);

      const dialog = await openLeave(user);

      expect(dialog).toHaveTextContent(
        'Do kontaktov skupine ne boš imel(a) več dostopa, dokler te znova ne povabijo.',
      );
      expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
      expect(within(dialog).getByRole('button', { name: 'Zapusti skupino' })).toBeInTheDocument();
    },
  );

  it('FR-007-06: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilec', async () => {
    const { user, members } = render('EDITOR');
    await management();
    const trigger = await screen.findByRole('button', { name: 'Zapusti skupino' });
    const dialog = await openLeave(user);

    await user.click(within(dialog).getByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(members.of('POST', `/api/groups/${GROUP_ID}/leave`)).toHaveLength(0);
  });

  it('FR-007-06: potrditev – POST leave, seznam skupin, obvestilo, osvežen seznam, h1 v fokusu', async () => {
    const { user, members, listRequests } = render('EDITOR');
    const dialog = await openLeave(user);
    const before = listRequests(10).length;

    await user.click(within(dialog).getByRole('button', { name: 'Zapusti skupino' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Skupine' })).toBeInTheDocument();
    expect(members.of('POST', `/api/groups/${GROUP_ID}/leave`)).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Zapustil(a) si skupino Projekt FERI.',
      ),
    );
    await waitFor(() => expect(listRequests(10).length).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Skupine' })).toHaveFocus(),
    );
  });

  it('FR-007-06: bralec arhivirane skupine lahko zapusti skupino', async () => {
    const { user, members } = render('VIEWER', { archived: true });
    const dialog = await openLeave(user);

    await user.click(within(dialog).getByRole('button', { name: 'Zapusti skupino' }));

    await waitFor(() =>
      expect(members.of('POST', `/api/groups/${GROUP_ID}/leave`)).toHaveLength(1),
    );
  });

  it.each([false, true])(
    'FR-007-07: lastnik (arhivirana: %s) – brez gumba, razlaga o prenosu lastništva',
    async (archived) => {
      render('OWNER', { archived });

      const section = await management();
      const region = within(section);
      await waitFor(() => expect(section).toHaveTextContent(OWNER_INFO));
      expect(region.queryByRole('button', { name: 'Zapusti skupino' })).not.toBeInTheDocument();
    },
  );

  it('FR-007-07: 409 OWNER_CANNOT_LEAVE (strežnik se ne ujema z vmesnikom) – razumljivo sporočilo, dialog ostane', async () => {
    const { user } = render('ADMIN', {
      leave: () => ({ status: 409, body: { code: 'OWNER_CANNOT_LEAVE' } }),
    });
    const dialog = await openLeave(user);

    await user.click(within(dialog).getByRole('button', { name: 'Zapusti skupino' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Kot lastnik skupine ne moreš zapustiti. Najprej prenesi lastništvo.',
    );
    expect(alert.textContent).not.toMatch(/OWNER_CANNOT_LEAVE/);
  });

  it('FR-007-08: zadnji član trajno arhivirane skupine – brez gumba, razlaga, da jo lahko le izbriše', async () => {
    render('VIEWER', {
      archived: true,
      permanent: true,
      members: [selfMember('VIEWER')],
    });

    const section = await management();
    const region = within(section);
    await waitFor(() => expect(section).toHaveTextContent(LAST_INFO));
    expect(region.queryByRole('button', { name: 'Zapusti skupino' })).not.toBeInTheDocument();
  });

  it('FR-007-08: trajno arhivirana skupina z dvema članoma – gumb viden', async () => {
    render('VIEWER', {
      archived: true,
      permanent: true,
      members: [
        selfMember('VIEWER'),
        member(2, { name: 'Drug Član', role: 'ADMIN', canManage: false }),
      ],
    });

    const section = await management();
    expect(
      await within(section).findByRole('button', { name: 'Zapusti skupino' }),
    ).toBeInTheDocument();
    expect(section).not.toHaveTextContent(LAST_INFO);
  });

  it('FR-007-08: 409 LAST_MEMBER_CANNOT_LEAVE – razumljivo sporočilo, dialog ostane', async () => {
    const { user } = render('VIEWER', {
      archived: true,
      permanent: true,
      leave: () => ({ status: 409, body: { code: 'LAST_MEMBER_CANNOT_LEAVE' } }),
    });
    const dialog = await openLeave(user);

    await user.click(within(dialog).getByRole('button', { name: 'Zapusti skupino' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(LAST_INFO);
    expect(alert.textContent).not.toMatch(/LAST_MEMBER/);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('FR-007-11: 404 pri zapustitvi in skupina vrne 404 – »Te strani ni« (F1)', async () => {
    let calls = 0;
    const { user } = render('EDITOR', {
      leave: () => ({ status: 404 }),
      groupGet: () => {
        calls += 1;
        return calls === 1
          ? { status: 200, body: groupDetail({ role: 'EDITOR' }) }
          : { status: 404 };
      },
    });
    const dialog = await openLeave(user);

    await user.click(within(dialog).getByRole('button', { name: 'Zapusti skupino' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['strežnik ne uspe', { status: 500 }, 'Skupine ni bilo mogoče zapustiti. Poskusi znova.'],
    ['ni povezave', 'network-error' as const, 'Ni povezave. Preveri povezavo in poskusi znova.'],
  ])('FR-007-11: %s – opozorilo brez tehničnih kod, član ostane', async (_name, reply, message) => {
    const { user } = render('EDITOR', { leave: () => reply });
    const dialog = await openLeave(user);

    await user.click(within(dialog).getByRole('button', { name: 'Zapusti skupino' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each(['sl', 'en'] as const)(
    'FR-007-06 SC-006: dialog je dostopen (axe) in dvojezičen – %s',
    async (language) => {
      await i18n.changeLanguage(language);
      const { user } = render('EDITOR');
      await user.click(
        await screen.findByRole('button', {
          name: language === 'sl' ? 'Zapusti skupino' : 'Leave group',
        }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: language === 'sl' ? 'Zapustim skupino Projekt FERI?' : 'Leave Projekt FERI?',
      });

      expect(dialog).toHaveTextContent(
        language === 'sl'
          ? 'Do kontaktov skupine ne boš imel(a) več dostopa, dokler te znova ne povabijo.'
          : "You will no longer have access to the group's contacts until you are invited again.",
      );
      expect((await axe(dialog)).violations).toEqual([]);
    },
  );

  it('FR-007-07 FR-007-08 FR-007-11: angleška besedila razlag in napak', async () => {
    await i18n.changeLanguage('en');
    const owner = render('OWNER');
    const ownerSection = await screen.findByRole('region', { name: 'Group management' });
    await waitFor(() =>
      expect(ownerSection).toHaveTextContent(
        'As the owner you can leave the group only after transferring ownership to another member.',
      ),
    );
    owner.unmount();

    const last = render('VIEWER', {
      archived: true,
      permanent: true,
      members: [selfMember('VIEWER')],
    });
    const lastSection = await screen.findByRole('region', { name: 'Group management' });
    await waitFor(() =>
      expect(lastSection).toHaveTextContent(
        'As the last member you cannot leave the group, you can only delete it.',
      ),
    );
    last.unmount();

    const { user } = render('ADMIN', {
      leave: () => ({ status: 409, body: { code: 'OWNER_CANNOT_LEAVE' } }),
    });
    await user.click(await screen.findByRole('button', { name: 'Leave group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave Projekt FERI?' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave group' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'As the owner you cannot leave the group. Transfer ownership first.',
    );
  });

  it.each([
    ['sl', 'Za to dejanje nimaš več pravic.'],
    ['en', 'You no longer have permission for this action.'],
  ] as const)(
    'FR-007-11: 403 pri zapustitvi (%s) – sporočilo in ponovno branje skupine',
    async (language, message) => {
      await i18n.changeLanguage(language);
      let groupReads = 0;
      const { user } = render('EDITOR', {
        leave: () => ({ status: 403, body: { code: 'FORBIDDEN' } }),
        groupGet: () => {
          groupReads += 1;
          return { status: 200, body: groupDetail({ role: 'EDITOR' }) };
        },
      });
      await user.click(
        await screen.findByRole('button', {
          name: language === 'sl' ? 'Zapusti skupino' : 'Leave group',
        }),
      );
      const dialog = await screen.findByRole('dialog');
      const readsBefore = groupReads;

      await user.click(
        within(dialog).getByRole('button', {
          name: language === 'sl' ? 'Zapusti skupino' : 'Leave group',
        }),
      );

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
      await waitFor(() => expect(groupReads).toBeGreaterThan(readsBefore));
    },
  );

  it('FR-007-06 FR-007-08 FR-007-11: angleško obvestilo uspeha, LAST_MEMBER_CANNOT_LEAVE, 500 in brez povezave', async () => {
    await i18n.changeLanguage('en');
    const replies: Reply[] = [
      { status: 409, body: { code: 'LAST_MEMBER_CANNOT_LEAVE' } },
      { status: 500 },
      'network-error',
      { status: 204 },
    ];
    const { user } = render('ADMIN', { leave: () => replies.shift() ?? { status: 204 } });
    await user.click(await screen.findByRole('button', { name: 'Leave group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave Projekt FERI?' });
    const confirm = () => user.click(within(dialog).getByRole('button', { name: 'Leave group' }));

    for (const message of [
      'As the last member you cannot leave the group, you can only delete it.',
      'The group could not be left. Please try again.',
      "You're offline. Check your connection and try again.",
    ]) {
      await confirm();
      await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(message));
    }
    await confirm();

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent(
        'You left Projekt FERI.',
      ),
    );
  });
});
