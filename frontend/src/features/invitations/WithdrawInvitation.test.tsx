import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail } from '../../test/groupsApi';
import {
  INVITATION_ID,
  outgoingInvitation,
  outgoingReply,
  type Reply,
  renderInvitationsApp,
} from '../../test/invitationsApi';
import type { OutgoingInvitation } from './types';

// Umik čakajočega povabila z dialogom (FR-006-14, FR-006-15, FR-006-16; plan.md – Key elements; design.md 13.4).

const PATH = `/groups/${GROUP_ID}/settings`;
const ANA_INVITATION = outgoingInvitation(1, {
  id: INVITATION_ID,
  inviteeEmail: 'ana@primer.si',
  role: 'EDITOR',
});

function render(
  options: {
    archived?: boolean;
    withdraw?: (groupId: string, id: string, remove: () => void) => Reply | Promise<Reply>;
  } = {},
) {
  let items: OutgoingInvitation[] = [ANA_INVITATION];
  return renderInvitationsApp(
    PATH,
    {
      listOutgoing: (url) => outgoingReply(items)(url),
      withdraw: (group, id) => {
        const remove = () => {
          items = items.filter((i) => i.id !== id);
        };
        if (options.withdraw) return options.withdraw(group, id, remove);
        remove();
        return { status: 204 };
      },
    },
    {
      get: () => ({
        status: 200,
        body: groupDetail({ role: 'ADMIN', archived: options.archived ?? false }),
      }),
    },
  );
}

async function openDialog(user: ReturnType<typeof render>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Umakni povabilo za ana@primer.si' }));
  return screen.findByRole('dialog', { name: 'Umaknem povabilo za ana@primer.si?' });
}

describe('umik povabila', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-006-15: dialog – vprašanje s predmetom, posledica, fokus na Prekliči', async () => {
    const { user } = render();

    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent('Uporabnik povabila ne bo več videl. Lahko ga znova povabiš.');
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Umakni povabilo' })).toBeInTheDocument();
  });

  it('FR-006-15: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilec', async () => {
    const { user, invitations } = render();
    const trigger = await screen.findByRole('button', { name: 'Umakni povabilo za ana@primer.si' });

    await user.click(trigger);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Prekliči' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(
      invitations.of('DELETE', `/api/groups/${GROUP_ID}/invitations/${INVITATION_ID}`),
    ).toHaveLength(0);
  });

  it('FR-006-14 FR-006-15: potrditev – DELETE, vrstica izgine, obvestilo, fokus na naslovu razdelka', async () => {
    const { user, invitations } = render();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Umakni povabilo' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Povabilo je umaknjeno.',
      ),
    );
    expect(
      invitations.of('DELETE', `/api/groups/${GROUP_ID}/invitations/${INVITATION_ID}`),
    ).toHaveLength(1);
    const pending = within(await screen.findByRole('region', { name: 'Čakajoča povabila' }));
    await waitFor(() =>
      expect(
        pending.queryByRole('button', { name: 'Umakni povabilo za ana@primer.si' }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Čakajoča povabila' })).toHaveTextContent(
        'Ni čakajočih povabil.',
      ),
    );
    await waitFor(() =>
      expect(pending.getByRole('heading', { level: 2, name: 'Čakajoča povabila' })).toHaveFocus(),
    );
  });

  it('FR-006-14: umik v arhivirani skupini uspe', async () => {
    const { user } = render({ archived: true });

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Umakni povabilo' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Povabilo je umaknjeno.',
      ),
    );
  });

  it('FR-006-16: 404 – alert »Povabilo ni več na voljo.« in osvežitev seznama', async () => {
    const { user, invitations } = render({
      withdraw: (_group, _id, remove) => {
        remove();
        return { status: 404 };
      },
    });
    await screen.findByRole('button', { name: 'Umakni povabilo za ana@primer.si' });
    const before = invitations.of('GET', `/api/groups/${GROUP_ID}/invitations`).length;

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Umakni povabilo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Povabilo ni več na voljo.');
    await waitFor(() =>
      expect(invitations.of('GET', `/api/groups/${GROUP_ID}/invitations`).length).toBeGreaterThan(
        before,
      ),
    );
  });

  it('FR-006-14: 403 – alert »Za to dejanje nimaš več pravic.«', async () => {
    const { user } = render({ withdraw: () => ({ status: 403, body: { code: 'FORBIDDEN' } }) });

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Umakni povabilo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Za to dejanje nimaš več pravic.');
  });

  it('FR-006-14: 500 in brez povezave – alert brez kod', async () => {
    let reply: Reply = { status: 500, body: { code: 'INTERNAL' } };
    const { user } = render({ withdraw: () => reply });

    let dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Umakni povabilo' }));
    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Povabila ni bilo mogoče umakniti. Poskusi znova.');
    expect(failed).not.toHaveTextContent('INTERNAL');

    reply = 'network-error';
    dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Umakni povabilo' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ni povezave. Preveri povezavo in poskusi znova.',
      ),
    );
  });

  it.each(['sl', 'en'])('FR-006-15: brez kršitev axe z odprtim dialogom (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { user } = render();
    await user.click(
      await screen.findByRole('button', {
        name:
          language === 'sl'
            ? 'Umakni povabilo za ana@primer.si'
            : 'Withdraw invitation for ana@primer.si',
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect((await axe(dialog)).violations).toEqual([]);
  });
});
