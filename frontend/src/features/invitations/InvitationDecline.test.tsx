import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { groupId } from '../../test/groupsApi';
import {
  type Reply,
  receivedInvitation,
  receivedReply,
  renderInvitationsApp,
} from '../../test/invitationsApi';
import type { ReceivedInvitation } from './types';

// Zavrnitev povabila z dialogom (FR-006-10, FR-006-11; plan.md – Key elements; design.md 13.4).

const PATH = '/invitations';
const FERI = receivedInvitation(1, {
  group: { id: groupId(1), title: 'Projekt FERI', color: 'mah', archived: false },
});

function render(
  initial: ReceivedInvitation[],
  decline?: (id: string, remove: () => void) => Reply | Promise<Reply>,
) {
  let items = [...initial];
  const remove = (id: string) => {
    items = items.filter((i) => i.id !== id);
  };
  return renderInvitationsApp(PATH, {
    listReceived: (url) => receivedReply(items)(url),
    count: () => ({ status: 200, body: { count: items.length } }),
    decline: (id) =>
      decline
        ? decline(id, () => remove(id))
        : (() => {
            remove(id);
            return { status: 204 };
          })(),
  });
}

async function openDialog(user: ReturnType<typeof render>['user'], title = 'Projekt FERI') {
  await user.click(
    await screen.findByRole('button', { name: `Zavrni povabilo v skupino ${title}` }),
  );
  return screen.findByRole('dialog', { name: `Zavrnem povabilo v skupino ${title}?` });
}

describe('zavrnitev povabila', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-006-10: dialog – vprašanje s predmetom, posledica, fokus na Prekliči', async () => {
    const { user } = render([FERI]);

    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent(
      'Ne boš postal(a) član skupine. Skupina te lahko znova povabi.',
    );
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Zavrni povabilo' })).toBeInTheDocument();
  });

  it('FR-006-10: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilni gumb', async () => {
    const { user, invitations } = render([FERI]);
    const trigger = await screen.findByRole('button', {
      name: 'Zavrni povabilo v skupino Projekt FERI',
    });

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
    expect(invitations.of('POST', `/api/invitations/${FERI.id}/decline`)).toHaveLength(0);
  });

  it('FR-006-10: potrditev – zahtevek, povabilo izgine, obvestilo, število se zmanjša', async () => {
    const { user, invitations } = render([FERI]);
    expect(await screen.findByRole('link', { name: 'Povabila, 1 novo' })).toBeInTheDocument();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Zavrni povabilo' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Povabilo je zavrnjeno.',
      ),
    );
    expect(invitations.of('POST', `/api/invitations/${FERI.id}/decline`)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: 'Povabila' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nimaš novih povabil.' }),
    ).toBeInTheDocument();
  });

  it('FR-006-10: zavrnitev povabila v arhivirano skupino uspe', async () => {
    const archived = receivedInvitation(2, {
      group: { id: groupId(2), title: 'Konferenca', color: 'morje', archived: true },
    });
    const { user } = render([archived]);

    const dialog = await openDialog(user, 'Konferenca');
    await user.click(within(dialog).getByRole('button', { name: 'Zavrni povabilo' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Povabilo je zavrnjeno.',
      ),
    );
  });

  it('FR-006-11: 404 – alert »Povabilo ni več na voljo.« in osvežitev seznama', async () => {
    const { user, invitations } = render([FERI], (_id, remove) => {
      remove();
      return { status: 404 };
    });
    const listBefore = invitations.of('GET', '/api/invitations').length;
    const countBefore = invitations.of('GET', '/api/invitations/count').length;

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Zavrni povabilo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Povabilo ni več na voljo.');
    await waitFor(() =>
      expect(invitations.of('GET', '/api/invitations').length).toBeGreaterThan(listBefore),
    );
    await waitFor(() =>
      expect(invitations.of('GET', '/api/invitations/count').length).toBeGreaterThan(countBefore),
    );
  });

  it('FR-006-10: 500 – alert »Povabila ni bilo mogoče zavrniti. Poskusi znova.«, brez kod', async () => {
    const { user } = render([FERI], () => ({ status: 500, body: { code: 'INTERNAL' } }));

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Zavrni povabilo' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Povabila ni bilo mogoče zavrniti. Poskusi znova.');
    expect(alert).not.toHaveTextContent('INTERNAL');
    expect(screen.getByRole('list', { name: 'Prejeta povabila' })).toBeInTheDocument();
  });

  it.each(['sl', 'en'])('FR-006-10: brez kršitev axe z odprtim dialogom (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { user } = render([FERI]);
    await user.click(
      await screen.findByRole('button', {
        name:
          language === 'sl'
            ? 'Zavrni povabilo v skupino Projekt FERI'
            : 'Decline invitation to Projekt FERI',
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect((await axe(dialog)).violations).toEqual([]);
  });
});
