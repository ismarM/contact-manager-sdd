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

// Odstranitev člana z dialogom (FR-007-05, FR-007-11; plan.md – Key elements; design.md 8.11, 9.10).

const PATH = `/groups/${GROUP_ID}/settings`;
const UROS = member(2, { name: 'Urednik Uroš', role: 'EDITOR' });

function render(
  options: {
    callerRole?: Role;
    remove?: (groupId: string, id: string) => Reply | Promise<Reply>;
    groupGet?: () => Reply;
  } = {},
) {
  let all: Member[] = [selfMember(options.callerRole ?? 'ADMIN'), UROS];
  return renderMembersApp(
    PATH,
    {
      list: (url) => membersReply(all)(url),
      remove: (group, id) => {
        const reply = options.remove ? options.remove(group, id) : { status: 204 };
        if (!(reply instanceof Promise) && reply !== 'network-error' && reply.status === 204) {
          all = all.filter((m) => m.id !== id);
        }
        return reply;
      },
    },
    {
      get:
        options.groupGet ??
        (() => ({ status: 200, body: groupDetail({ role: options.callerRole ?? 'ADMIN' }) })),
    },
  );
}

async function openDialog(user: ReturnType<typeof render>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Dejanja za člana Urednik Uroš' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Odstrani iz skupine' }));
  return screen.findByRole('dialog', { name: 'Odstranim Urednik Uroš iz skupine Projekt FERI?' });
}

describe('RemoveMemberDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-007-05: dialog – vprašanje s predmetom, posledica, fokus na Prekliči, nevarni gumb Odstrani člana', async () => {
    const { user } = render();

    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent(
      'Urednik Uroš ne bo več imel(a) dostopa do kontaktov skupine.',
    );
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Odstrani člana' })).toBeInTheDocument();
  });

  it('FR-007-05: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilec', async () => {
    const { user, members } = render();
    const trigger = await screen.findByRole('button', { name: 'Dejanja za člana Urednik Uroš' });

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await openDialog(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(members.of('DELETE', `/api/groups/${GROUP_ID}/members/${UROS.id}`)).toHaveLength(0);
  });

  it('FR-007-05: potrditev – DELETE, vrstica izgine, obvestilo, fokus na naslovu razdelka', async () => {
    const { user, members } = render();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Odstrani člana' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Urednik Uroš je odstranjen(a) iz skupine.',
      ),
    );
    expect(members.of('DELETE', `/api/groups/${GROUP_ID}/members/${UROS.id}`)).toHaveLength(1);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dejanja za člana Urednik Uroš' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Člani' })).toHaveFocus(),
    );
  });

  it('FR-007-05 FR-007-11: 403 – »Tega člana ne moreš več upravljati.« in osvežitev seznama', async () => {
    const { user, members } = render({
      remove: () => ({ status: 403, body: { code: 'FORBIDDEN' } }),
    });
    const dialog = await openDialog(user);
    const before = members.of('GET', `/api/groups/${GROUP_ID}/members`).length;

    await user.click(within(dialog).getByRole('button', { name: 'Odstrani člana' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Tega člana ne moreš več upravljati.',
    );
    await waitFor(() =>
      expect(members.of('GET', `/api/groups/${GROUP_ID}/members`).length).toBeGreaterThan(before),
    );
  });

  it('FR-007-11: 404, skupina obstaja – »Člana ni več v skupini.« in osvežitev seznama (F1)', async () => {
    const { user, members } = render({ remove: () => ({ status: 404 }) });
    const dialog = await openDialog(user);
    const before = members.of('GET', `/api/groups/${GROUP_ID}/members`).length;

    await user.click(within(dialog).getByRole('button', { name: 'Odstrani člana' }));

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

  it('FR-007-05: odstranjeni član odpre stran skupine – skupina vrne 404 → »Te strani ni« (F1)', async () => {
    let calls = 0;
    const { user } = render({
      remove: () => ({ status: 404 }),
      groupGet: () => {
        calls += 1;
        return calls === 1
          ? { status: 200, body: groupDetail({ role: 'ADMIN' }) }
          : { status: 404 };
      },
    });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Odstrani člana' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
  });

  it('FR-007-11: 409 GROUP_ARCHIVED – razumljivo sporočilo v dialogu', async () => {
    const { user } = render({ remove: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }) });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Odstrani člana' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Skupina je arhivirana, članov zdaj ni mogoče spreminjati.',
    );
  });

  it.each([
    ['strežnik ne uspe', { status: 500 }, 'Člana ni bilo mogoče odstraniti. Poskusi znova.'],
    ['ni povezave', 'network-error' as const, 'Ni povezave. Preveri povezavo in poskusi znova.'],
  ])('FR-007-11: %s – opozorilo brez tehničnih kod, član ostane', async (_name, reply, message) => {
    const { user } = render({ remove: () => reply });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Odstrani člana' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert.textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each(['sl', 'en'] as const)(
    'FR-007-05 SC-006: dialog je dostopen (axe) in dvojezičen – %s',
    async (language) => {
      await i18n.changeLanguage(language);
      const { user } = render();
      await user.click(
        await screen.findByRole('button', {
          name:
            language === 'sl' ? 'Dejanja za člana Urednik Uroš' : 'Actions for member Urednik Uroš',
        }),
      );
      await user.click(
        await screen.findByRole('menuitem', {
          name: language === 'sl' ? 'Odstrani iz skupine' : 'Remove from group',
        }),
      );

      const dialog = await screen.findByRole('dialog', {
        name:
          language === 'sl'
            ? 'Odstranim Urednik Uroš iz skupine Projekt FERI?'
            : 'Remove Urednik Uroš from Projekt FERI?',
      });

      expect(
        within(dialog).getByRole('button', { name: language === 'sl' ? 'Prekliči' : 'Cancel' }),
      ).toHaveFocus();
      expect(
        within(dialog).getByRole('button', {
          name: language === 'sl' ? 'Odstrani člana' : 'Remove member',
        }),
      ).toBeInTheDocument();
      expect((await axe(dialog)).violations).toEqual([]);
    },
  );

  it('FR-007-05 FR-007-11: angleška besedila (obvestilo uspeha, napaka)', async () => {
    await i18n.changeLanguage('en');
    const replies: Reply[] = [{ status: 500 }, { status: 204 }];
    const { user } = render({ remove: () => replies.shift() ?? { status: 204 } });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for member Urednik Uroš' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from group' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Urednik Uroš from Projekt FERI?',
    });
    expect(dialog).toHaveTextContent(
      "Urednik Uroš will no longer have access to the group's contacts.",
    );

    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The member could not be removed. Please try again.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent(
        'Urednik Uroš was removed from the group.',
      ),
    );
  });

  it.each([
    ['403', { status: 403, body: { code: 'FORBIDDEN' } }, 'You can no longer manage this member.'],
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
    const { user } = render({ remove: () => reply });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for member Urednik Uroš' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from group' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Urednik Uroš from Projekt FERI?',
    });

    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  });

  it('FR-007-11: angleško sporočilo 404 ob obstoječi skupini', async () => {
    await i18n.changeLanguage('en');
    const { user } = render({ remove: () => ({ status: 404 }) });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for member Urednik Uroš' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from group' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Urednik Uroš from Projekt FERI?',
    });

    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .map((a) => a.textContent)
          .join(' '),
      ).toContain('This member is no longer in the group.'),
    );
  });
});
