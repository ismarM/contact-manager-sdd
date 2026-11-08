import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { groupId } from '../../test/groupsApi';
import {
  type Reply,
  received,
  receivedInvitation,
  receivedReply,
  renderInvitationsApp,
} from '../../test/invitationsApi';
import type { ReceivedInvitation } from './types';

// Sprejem povabila na strani *Povabila* (FR-006-06, FR-006-08, FR-006-09, FR-006-11; plan.md – Key elements).

const PATH = '/invitations';

/** Strežnik s stanjem: seznam in število sta skladna, uspešen sprejem povabilo odstrani. */
function render(
  initial: ReceivedInvitation[],
  accept?: (id: string, remove: () => void) => Reply | Promise<Reply>,
) {
  let items = [...initial];
  const remove = (id: string) => {
    items = items.filter((i) => i.id !== id);
  };
  return renderInvitationsApp(PATH, {
    listReceived: (url) => receivedReply(items)(url),
    count: () => ({ status: 200, body: { count: items.length } }),
    accept: (id) =>
      accept
        ? accept(id, () => remove(id))
        : (() => {
            const target = items.find((i) => i.id === id);
            remove(id);
            return {
              status: 200,
              body: {
                groupId: target?.group.id ?? '',
                title: target?.group.title ?? '',
                role: target?.role ?? 'VIEWER',
                archived: target?.group.archived ?? false,
              },
            };
          })(),
  });
}

async function expectNotice(text: string) {
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(text),
  );
}

describe('sprejem povabila', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-006-08: klik na Sprejmi pošlje zahtevek, povabilo izgine, obvestilo s povezavo Odpri skupino', async () => {
    const invitation = receivedInvitation(1, {
      group: { id: groupId(1), title: 'Projekt FERI', color: 'mah', archived: false },
    });
    const { user, invitations } = render([invitation]);

    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Projekt FERI' }),
    );

    await expectNotice('Pridružil(a) si se skupini Projekt FERI.');
    expect(invitations.of('POST', `/api/invitations/${invitation.id}/accept`)).toHaveLength(1);
    const link = within(screen.getByRole('region', { name: 'Obvestila' })).getByRole('link', {
      name: 'Odpri skupino',
    });
    expect(link).toHaveAttribute('href', `/groups/${groupId(1)}`);
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Prejeta povabila' })).toBeNull(),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nimaš novih povabil.' }),
    ).toBeInTheDocument();
  });

  it('FR-006-06: število v zgornji vrstici se zmanjša brez ponovnega nalaganja strani', async () => {
    const { user } = render(received(2));
    expect(await screen.findByRole('link', { name: 'Povabila, 2 novi' })).toBeInTheDocument();

    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Skupina 002' }),
    );

    expect(await screen.findByRole('link', { name: 'Povabila, 1 novo' })).toBeInTheDocument();
  });

  it('FR-006-08: po sprejemu se povzetek skupin ponovno naloži', async () => {
    const { user, api } = render(received(1));
    await screen.findByRole('list', { name: 'Prejeta povabila' });
    const before = api.of('GET', '/api/groups').length;

    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Skupina 001' }),
    );

    await waitFor(() => expect(api.of('GET', '/api/groups').length).toBeGreaterThan(before));
  });

  it('FR-006-08: fokus preide na naslednje povabilo, po zadnjem na naslov strani', async () => {
    const { user } = render(received(2));
    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Skupina 002' }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Prejeta povabila' })).getAllByRole('listitem'),
      ).toHaveLength(1),
    );
    const remaining = within(screen.getByRole('list', { name: 'Prejeta povabila' })).getByRole(
      'listitem',
    );
    await waitFor(() => expect(remaining).toContainElement(document.activeElement as HTMLElement));

    await user.click(
      within(remaining).getByRole('button', { name: 'Sprejmi povabilo v skupino Skupina 001' }),
    );

    const heading = await screen.findByRole('heading', { level: 1, name: 'Povabila' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('FR-006-09: sprejem v arhivirano skupino – enako obvestilo', async () => {
    const { user } = render([
      receivedInvitation(1, {
        group: { id: groupId(1), title: 'Konferenca', color: 'morje', archived: true },
      }),
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Konferenca' }),
    );

    await expectNotice('Pridružil(a) si se skupini Konferenca.');
  });

  it('FR-006-11: 404 – alert »Povabilo ni več na voljo.«, seznam in število se ponovno naložita', async () => {
    const { user, invitations } = render(received(1), (_id, remove) => {
      remove();
      return { status: 404 };
    });
    await screen.findByRole('link', { name: 'Povabila, 1 novo' });
    const listBefore = invitations.of('GET', '/api/invitations').length;
    const countBefore = invitations.of('GET', '/api/invitations/count').length;

    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Skupina 001' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Povabilo ni več na voljo.');
    await waitFor(() =>
      expect(invitations.of('GET', '/api/invitations').length).toBeGreaterThan(listBefore),
    );
    await waitFor(() =>
      expect(invitations.of('GET', '/api/invitations/count').length).toBeGreaterThan(countBefore),
    );
    expect(await screen.findByRole('link', { name: 'Povabila' })).toBeInTheDocument();
  });

  it('FR-006-08: 409 ALREADY_MEMBER – alert »Že si član te skupine.« in osvežitev seznama', async () => {
    const { user, invitations } = render(received(1), (_id, remove) => {
      remove();
      return { status: 409, body: { code: 'ALREADY_MEMBER' } };
    });
    const listBefore = invitations.of('GET', '/api/invitations').length;

    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Skupina 001' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Že si član te skupine.');
    await waitFor(() =>
      expect(invitations.of('GET', '/api/invitations').length).toBeGreaterThan(listBefore),
    );
  });

  it('FR-006-08: 500 in brez povezave – alert brez kod, povabilo ostane', async () => {
    let reply: Reply = { status: 500, body: { code: 'INTERNAL' } };
    const { user } = render(received(1), () => reply);
    const button = await screen.findByRole('button', {
      name: 'Sprejmi povabilo v skupino Skupina 001',
    });

    await user.click(button);
    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Povabila ni bilo mogoče sprejeti. Poskusi znova.');
    expect(failed).not.toHaveTextContent('INTERNAL');

    reply = 'network-error';
    await user.click(
      await screen.findByRole('button', { name: 'Sprejmi povabilo v skupino Skupina 001' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ni povezave. Preveri povezavo in poskusi znova.',
      ),
    );
    expect(screen.getByRole('list', { name: 'Prejeta povabila' })).toBeInTheDocument();
  });

  it.each(['sl', 'en'])('FR-006-08: brez kršitev axe po napaki (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { user, container } = render(received(1), () => ({ status: 404 }));
    await user.click(
      await screen.findByRole('button', {
        name:
          language === 'sl'
            ? 'Sprejmi povabilo v skupino Skupina 001'
            : 'Accept invitation to Skupina 001',
      }),
    );

    await screen.findByRole('alert');
    expect((await axe(container)).violations).toEqual([]);
  });
});
