import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail } from '../../test/groupsApi';
import {
  member,
  memberId,
  membersReply,
  type Reply,
  renderMembersApp,
  selfMember,
} from '../../test/membersApi';
import type { Role } from '../groups/types';
import type { Member } from './types';

// Prenos lastništva (FR-007-09, FR-007-10, FR-007-11; plan.md – Key elements; design.md 8.11, 9.7).

const PATH = `/groups/${GROUP_ID}/settings`;
const INFO = 'Lastništvo lahko preneseš, ko ima skupina še vsaj enega člana.';
const ROSTER: Member[] = [
  selfMember('OWNER'),
  member(1, { name: 'Bralec Boris', role: 'VIEWER' }),
  member(2, { name: 'Admin Alenka', role: 'ADMIN' }),
];

function render(
  role: Role,
  options: {
    archived?: boolean;
    permanent?: boolean;
    members?: Member[];
    transfer?: (groupId: string, body: unknown) => Reply | Promise<Reply>;
    groupGet?: () => Reply;
  } = {},
) {
  let currentRole: Role = role;
  const all = options.members ?? ROSTER;
  return renderMembersApp(
    PATH,
    {
      list: (url) => membersReply(all)(url),
      transfer: (group, body) => {
        const reply = options.transfer
          ? options.transfer(group, body)
          : { status: 200, body: groupDetail({ role: 'ADMIN' }) as unknown as object };
        if (!(reply instanceof Promise) && reply !== 'network-error' && reply.status === 200) {
          currentRole = 'ADMIN';
        }
        return reply;
      },
    },
    {
      get:
        options.groupGet ??
        (() => ({
          status: 200,
          body: groupDetail({
            role: currentRole,
            archived: options.archived ?? false,
            permanentlyArchived: options.permanent ?? false,
          }),
        })),
    },
  );
}

const management = async () => screen.findByRole('region', { name: 'Upravljanje skupine' });

async function openTransfer(user: ReturnType<typeof render>['user']) {
  await management();
  await user.click(await screen.findByRole('button', { name: 'Prenesi lastništvo' }));
  return screen.findByRole('dialog', { name: 'Prenesem lastništvo skupine Projekt FERI?' });
}

describe('TransferOwnership', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-007-09: dialog – izbira enega od ostalih članov, polje za naslov, fokus na Prekliči', async () => {
    const { user } = render('OWNER');

    const dialog = await openTransfer(user);

    const select = within(dialog).getByRole('combobox', { name: 'Novi lastnik' });
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toContain('Bralec Boris (Bralec)');
    expect(options).toContain('Admin Alenka (Admin)');
    expect(options.join('|')).not.toContain('Ana Novak');
    expect(
      within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' })).toBeInTheDocument();
  });

  it('FR-007-09: po izbiri člana je vidna posledica »‹ime› bo postal(a) lastnik, ti pa boš admin.«', async () => {
    const { user } = render('OWNER');
    const dialog = await openTransfer(user);

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
      memberId(1),
    );

    expect(dialog).toHaveTextContent('Bralec Boris bo postal(a) lastnik, ti pa boš admin.');
  });

  it('FR-007-09: napačen naslov – napaka ob polju, brez zahtevka, nič se ne spremeni', async () => {
    const { user, members } = render('OWNER');
    const dialog = await openTransfer(user);
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
      memberId(1),
    );
    const field = within(dialog).getByRole('textbox', {
      name: 'Za potrditev vpiši naslov skupine',
    });
    await user.type(field, 'Napačen naslov');

    await user.click(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' }));

    await waitFor(() =>
      expect(field).toHaveAccessibleDescription('Vpisani naslov se ne ujema z naslovom skupine.'),
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(members.of('POST', `/api/groups/${GROUP_ID}/ownership-transfer`)).toHaveLength(0);
  });

  it('FR-007-09: brez izbranega člana – »Izberi člana.«, brez zahtevka', async () => {
    const { user, members } = render('OWNER');
    const dialog = await openTransfer(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
      'Projekt FERI',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' }));

    await waitFor(() =>
      expect(
        within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
      ).toHaveAccessibleDescription('Izberi člana.'),
    );
    expect(members.of('POST', `/api/groups/${GROUP_ID}/ownership-transfer`)).toHaveLength(0);
  });

  it('FR-007-09: pravilen naslov – POST z memberId, obvestilo, nastavitve se osvežijo (vloga admin, brez Prenesi lastništvo)', async () => {
    const { user, members } = render('OWNER');
    const dialog = await openTransfer(user);
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
      memberId(1),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
      'Projekt FERI',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Lastništvo je preneseno na Bralec Boris.',
      ),
    );
    expect(members.of('POST', `/api/groups/${GROUP_ID}/ownership-transfer`)[0]?.body).toEqual({
      memberId: memberId(1),
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Prenesi lastništvo' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Arhiviraj skupino' })).not.toBeInTheDocument();
    // možnosti vloge admin: lahko zapusti skupino, lastništva ne more več prenesti
    expect(await screen.findByRole('button', { name: 'Zapusti skupino' })).toBeInTheDocument();
  });

  it('FR-007-09: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilec', async () => {
    const { user, members } = render('OWNER');
    await management();
    const trigger = await screen.findByRole('button', { name: 'Prenesi lastništvo' });
    const dialog = await openTransfer(user);

    await user.click(within(dialog).getByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(members.of('POST', `/api/groups/${GROUP_ID}/ownership-transfer`)).toHaveLength(0);
  });

  it('FR-007-09: lastnik kot edini član – brez gumba, razlaga', async () => {
    render('OWNER', { members: [selfMember('OWNER')] });

    const section = await management();
    const region = within(section);
    await waitFor(() => expect(section).toHaveTextContent(INFO));
    expect(region.queryByRole('button', { name: 'Prenesi lastništvo' })).not.toBeInTheDocument();
  });

  it('FR-007-09: število članov pride iz total, ne iz števila elementov (total 40, ena vrstica → gumb viden)', async () => {
    renderMembersApp(
      PATH,
      {
        list: (url) => ({
          status: 200,
          body: {
            total: 40,
            page: 0,
            size: Number(url.searchParams.get('size') ?? 25),
            deletedOwner: false,
            items: [selfMember('OWNER')],
          },
        }),
      },
      { get: () => ({ status: 200, body: groupDetail({ role: 'OWNER' }) }) },
    );

    const section = await management();

    expect(
      await within(section).findByRole('button', { name: 'Prenesi lastništvo' }),
    ).toBeInTheDocument();
    expect(section).not.toHaveTextContent(INFO);
  });

  it.each(['ADMIN', 'EDITOR', 'VIEWER'] as const)(
    'FR-007-09: %s ne vidi Prenesi lastništvo',
    async (role) => {
      render(role);

      const region = within(await management());
      await screen.findByRole('table', { name: 'Člani' });
      expect(region.queryByRole('button', { name: 'Prenesi lastništvo' })).not.toBeInTheDocument();
    },
  );

  it('FR-007-10: arhivirana skupina – brez Prenesi lastništvo', async () => {
    render('OWNER', { archived: true });

    const region = within(await management());
    await screen.findByRole('table', { name: 'Člani' });
    expect(region.queryByRole('button', { name: 'Prenesi lastništvo' })).not.toBeInTheDocument();
  });

  it('FR-007-09: 409 TARGET_NOT_MEMBER – »Izbrani uporabnik ni več član skupine.«, dialog ostane, seznam članov se osveži', async () => {
    const { user, members } = render('OWNER', {
      transfer: () => ({ status: 409, body: { code: 'TARGET_NOT_MEMBER' } }),
    });
    const dialog = await openTransfer(user);
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
      memberId(1),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
      'Projekt FERI',
    );
    const before = members.of('GET', `/api/groups/${GROUP_ID}/members`).length;

    await user.click(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Izbrani uporabnik ni več član skupine.');
    expect(alert.textContent).not.toMatch(/TARGET_NOT_MEMBER/);
    await waitFor(() =>
      expect(members.of('GET', `/api/groups/${GROUP_ID}/members`).length).toBeGreaterThan(before),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each([
    [
      '409 GROUP_ARCHIVED',
      { status: 409, body: { code: 'GROUP_ARCHIVED' } },
      'Skupina je arhivirana, lastništva zdaj ni mogoče prenesti.',
    ],
    ['403', { status: 403, body: { code: 'FORBIDDEN' } }, 'Za to dejanje nimaš več pravic.'],
    ['500', { status: 500 }, 'Lastništva ni bilo mogoče prenesti. Poskusi znova.'],
    ['ni povezave', 'network-error' as const, 'Ni povezave. Preveri povezavo in poskusi znova.'],
  ])(
    'FR-007-11: %s – razumljivo sporočilo v dialogu, brez tehničnih kod',
    async (_name, reply, message) => {
      const { user } = render('OWNER', { transfer: () => reply });
      const dialog = await openTransfer(user);
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
        memberId(1),
      );
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
        'Projekt FERI',
      );

      await user.click(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' }));

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert.textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    },
  );

  it('FR-007-11: 404 pri prenosu in skupina vrne 404 – »Te strani ni« (F1)', async () => {
    let calls = 0;
    const { user } = render('OWNER', {
      transfer: () => ({ status: 404 }),
      groupGet: () => {
        calls += 1;
        return calls === 1
          ? { status: 200, body: groupDetail({ role: 'OWNER' }) }
          : { status: 404 };
      },
    });
    const dialog = await openTransfer(user);
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
      memberId(1),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
      'Projekt FERI',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
  });

  it.each(['sl', 'en'] as const)(
    'FR-007-09 SC-006: dialog je dostopen (axe) in dvojezičen – %s',
    async (language) => {
      await i18n.changeLanguage(language);
      const { user } = render('OWNER');
      await user.click(
        await screen.findByRole('button', {
          name: language === 'sl' ? 'Prenesi lastništvo' : 'Transfer ownership',
        }),
      );

      const dialog = await screen.findByRole('dialog', {
        name:
          language === 'sl'
            ? 'Prenesem lastništvo skupine Projekt FERI?'
            : 'Transfer ownership of Projekt FERI?',
      });

      expect(
        within(dialog).getByRole('combobox', {
          name: language === 'sl' ? 'Novi lastnik' : 'New owner',
        }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('textbox', {
          name:
            language === 'sl'
              ? 'Za potrditev vpiši naslov skupine'
              : 'Type the group title to confirm',
        }),
      ).toBeInTheDocument();
      expect((await axe(dialog)).violations).toEqual([]);
    },
  );

  it('FR-007-09 FR-007-11: angleška besedila razlage in napak', async () => {
    await i18n.changeLanguage('en');
    const solo = render('OWNER', { members: [selfMember('OWNER')] });
    const section = await screen.findByRole('region', { name: 'Group management' });
    await waitFor(() =>
      expect(section).toHaveTextContent(
        'You can transfer ownership once the group has at least one more member.',
      ),
    );
    solo.unmount();

    const { user } = render('OWNER', {
      transfer: () => ({ status: 409, body: { code: 'TARGET_NOT_MEMBER' } }),
    });
    await user.click(await screen.findByRole('button', { name: 'Transfer ownership' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Transfer ownership of Projekt FERI?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole('combobox', { name: 'New owner' }),
      ).toHaveAccessibleDescription('Choose a member.'),
    );
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'New owner' }),
      memberId(1),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Type the group title to confirm' }),
      'Napačen',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole('textbox', { name: 'Type the group title to confirm' }),
      ).toHaveAccessibleDescription('The title you typed does not match the group title.'),
    );
    await user.clear(
      within(dialog).getByRole('textbox', { name: 'Type the group title to confirm' }),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Type the group title to confirm' }),
      'Projekt FERI',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The selected user is no longer a member of the group.',
    );
  });

  it('FR-007-11: 403 pri prenosu – skupina se ponovno prebere in razdelek prilagodi vlogi', async () => {
    let groupReads = 0;
    const { user } = render('OWNER', {
      transfer: () => ({ status: 403, body: { code: 'FORBIDDEN' } }),
      groupGet: () => {
        groupReads += 1;
        return { status: 200, body: groupDetail({ role: groupReads === 1 ? 'OWNER' : 'ADMIN' }) };
      },
    });
    const dialog = await openTransfer(user);
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi lastnik' }),
      memberId(1),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
      'Projekt FERI',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Prenesi lastništvo' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Za to dejanje nimaš več pravic.',
    );
    await waitFor(() => expect(groupReads).toBeGreaterThanOrEqual(2));
    // dialog ostane odprt (plan.md); po zaprtju razdelek ne ponuja več prenosa, ker klicatelj ni več lastnik
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Prekliči' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Prenesi lastništvo' })).not.toBeInTheDocument(),
    );
  });

  async function submitEnglishTransfer(user: ReturnType<typeof render>['user']) {
    await user.click(await screen.findByRole('button', { name: 'Transfer ownership' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Transfer ownership of Projekt FERI?',
    });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'New owner' }),
      memberId(1),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Type the group title to confirm' }),
      'Projekt FERI',
    );
    expect(dialog).toHaveTextContent(
      'Bralec Boris will become the owner and you will become an admin.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    return dialog;
  }

  it.each([
    [
      '403',
      { status: 403, body: { code: 'FORBIDDEN' } },
      'You no longer have permission for this action.',
    ],
    [
      'GROUP_ARCHIVED',
      { status: 409, body: { code: 'GROUP_ARCHIVED' } },
      'The group is archived, ownership cannot be transferred now.',
    ],
    ['500', { status: 500 }, 'Ownership could not be transferred. Please try again.'],
    [
      'brez povezave',
      'network-error' as const,
      "You're offline. Check your connection and try again.",
    ],
  ])('FR-007-11: angleško sporočilo napake pri prenosu – %s', async (_name, reply, message) => {
    await i18n.changeLanguage('en');
    const { user } = render('OWNER', { transfer: () => reply });

    const dialog = await submitEnglishTransfer(user);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  });

  it('FR-007-09 FR-007-11: angleško obvestilo uspeha prenosa', async () => {
    await i18n.changeLanguage('en');
    const { user } = render('OWNER');

    await submitEnglishTransfer(user);

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent(
        'Ownership was transferred to Bralec Boris.',
      ),
    );
  });
});
