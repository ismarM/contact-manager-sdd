import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail } from '../../test/groupsApi';
import {
  outgoing,
  outgoingInvitation,
  outgoingReply,
  renderInvitationsApp,
} from '../../test/invitationsApi';
import { setViewport } from '../../test/viewport';
import type { Role } from '../groups/types';
import type { OutgoingInvitation } from './types';

// Razdelek *Čakajoča povabila* v *Nastavitvah* skupine (FR-006-13, FR-006-14; plan.md – Key elements; design.md 8.6).

const PATH = `/groups/${GROUP_ID}/settings`;

function render(
  options: {
    role?: Role;
    archived?: boolean;
    pending?: OutgoingInvitation[];
    listOutgoing?: NonNullable<Parameters<typeof renderInvitationsApp>[1]>['listOutgoing'];
    send?: NonNullable<Parameters<typeof renderInvitationsApp>[1]>['send'];
  } = {},
) {
  return renderInvitationsApp(
    PATH,
    {
      listOutgoing: options.listOutgoing ?? ((url) => outgoingReply(options.pending ?? [])(url)),
      send: options.send,
    },
    {
      get: () => ({
        status: 200,
        body: groupDetail({ role: options.role ?? 'ADMIN', archived: options.archived ?? false }),
      }),
    },
  );
}

async function section() {
  return within(await screen.findByRole('region', { name: 'Čakajoča povabila' }));
}

describe('PendingInvitationsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-006-13: admin vidi razdelek pod razdelkom Povabi člana', async () => {
    render({ pending: outgoing(1) });

    const pending = await screen.findByRole('region', { name: 'Čakajoča povabila' });
    const invite = await screen.findByRole('region', { name: 'Povabi člana' });
    expect(invite.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(pending).getByRole('heading', { level: 2, name: 'Čakajoča povabila' }),
    ).toBeInTheDocument();
  });

  it('FR-006-13: preglednica z naslovi stolpcev in vrsticami, novejše prvo', async () => {
    render({ pending: outgoing(2) });

    const table = (await section()).getByRole('table', { name: 'Čakajoča povabila' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Povabljeni', 'Vloga', 'Povabil(a)', 'Datum', 'Dejanja']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('uporabnik2@primer.si');
    expect(rows[0]).toHaveTextContent('Urednik');
    expect(rows[0]).toHaveTextContent('Ana Novak');
    expect(rows[0]).toHaveTextContent('5. 11. 2026');
    expect(rows[1]).toHaveTextContent('uporabnik1@primer.si');
  });

  it('FR-006-14: gumb Umakni povabilo za … samo ob canWithdraw', async () => {
    render({
      role: 'ADMIN',
      pending: [
        outgoingInvitation(2, { inviteeEmail: 'ana@primer.si', role: 'ADMIN', canWithdraw: false }),
        outgoingInvitation(1, {
          inviteeEmail: 'bojan@primer.si',
          role: 'EDITOR',
          canWithdraw: true,
        }),
      ],
    });

    const pending = await section();
    expect(
      await pending.findByRole('button', { name: 'Umakni povabilo za bojan@primer.si' }),
    ).toBeInTheDocument();
    expect(
      pending.queryByRole('button', { name: 'Umakni povabilo za ana@primer.si' }),
    ).not.toBeInTheDocument();
  });

  it('FR-006-13: izbrisan povabitelj – »izbrisan uporabnik«', async () => {
    render({ pending: [outgoingInvitation(1, { invitedBy: null })] });

    const table = (await section()).getByRole('table', { name: 'Čakajoča povabila' });
    await waitFor(() =>
      expect(within(table).getAllByRole('row')[1]).toHaveTextContent('izbrisan uporabnik'),
    );
  });

  it('FR-006-13: prazno stanje »Ni čakajočih povabil.«', async () => {
    render({ pending: [] });

    await section();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Čakajoča povabila' })).toHaveTextContent(
        'Ni čakajočih povabil.',
      ),
    );
  });

  it('FR-006-13: 30 povabil – paginacija »Strani rezultatov: Čakajoča povabila«', async () => {
    const { user, invitations } = render({ pending: outgoing(30) });

    const nav = (await section()).getByRole('navigation', {
      name: 'Strani rezultatov: Čakajoča povabila',
    });
    expect(within(nav).getByRole('status')).toHaveTextContent('1–25 od 30');
    await user.click(within(nav).getByRole('button', { name: 'Naslednja' }));
    await waitFor(() =>
      expect(
        invitations
          .of('GET', `/api/groups/${GROUP_ID}/invitations`)
          .some((r) => r.search.get('page') === '1'),
      ).toBe(true),
    );
  });

  it('FR-006-13: izbira velikosti strani 100 zahteva size=100', async () => {
    const { user, invitations } = render({ pending: outgoing(30) });
    const nav = (await section()).getByRole('navigation', {
      name: 'Strani rezultatov: Čakajoča povabila',
    });

    await user.selectOptions(within(nav).getByRole('combobox', { name: 'Velikost strani' }), '100');

    await waitFor(() =>
      expect(
        invitations
          .of('GET', `/api/groups/${GROUP_ID}/invitations`)
          .some((r) => r.search.get('size') === '100'),
      ).toBe(true),
    );
  });

  it('FR-006-13: arhivirana skupina – razdelek viden, Povabi člana ne', async () => {
    render({ role: 'OWNER', archived: true, pending: outgoing(1) });

    expect(await screen.findByRole('region', { name: 'Čakajoča povabila' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Povabi člana' })).not.toBeInTheDocument();
  });

  it.each(['EDITOR', 'VIEWER'] as Role[])(
    'FR-006-13: %s razdelka ne vidi in ne pošlje zahtevka za seznam',
    async (role) => {
      const { invitations } = render({ role, pending: outgoing(1) });

      await screen.findByRole('heading', { level: 2, name: 'Podatki skupine' });
      expect(screen.queryByRole('region', { name: 'Čakajoča povabila' })).not.toBeInTheDocument();
      expect(invitations.of('GET', `/api/groups/${GROUP_ID}/invitations`)).toHaveLength(0);
    },
  );

  it('FR-006-13: po uspešnem pošiljanju se seznam ponovno naloži in novo povabilo je prvo', async () => {
    let items = outgoing(1);
    const { user } = render({
      listOutgoing: (url) => outgoingReply(items)(url),
      send: (_group, body) => {
        const input = body as { email: string; role: OutgoingInvitation['role'] };
        const created = outgoingInvitation(50, { inviteeEmail: input.email, role: input.role });
        items = [created, ...items];
        return { status: 201, body: created as never };
      },
    });
    const form = within(await screen.findByRole('region', { name: 'Povabi člana' }));
    await user.type(form.getByRole('textbox', { name: 'E-naslov' }), 'novi@primer.si');
    await user.click(form.getByRole('radio', { name: 'Bralec' }));

    await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));

    const table = (await section()).getByRole('table', { name: 'Čakajoča povabila' });
    await waitFor(() =>
      expect(within(table).getAllByRole('row')[1]).toHaveTextContent('novi@primer.si'),
    );
  });

  it('FR-006-13: napaka nalaganja – alert in Poskusi znova', async () => {
    let calls = 0;
    const { user, invitations } = render({
      listOutgoing: (url) => {
        calls += 1;
        return calls === 1
          ? { status: 500, body: { code: 'INTERNAL' } }
          : outgoingReply(outgoing(1))(url);
      },
    });

    const pending = await section();
    expect(await pending.findByRole('alert')).toHaveTextContent(
      'Povabil ni bilo mogoče naložiti. Poskusi znova.',
    );
    await user.click(pending.getByRole('button', { name: 'Poskusi znova' }));

    expect(await pending.findByRole('table', { name: 'Čakajoča povabila' })).toBeInTheDocument();
    expect(invitations.of('GET', `/api/groups/${GROUP_ID}/invitations`)).toHaveLength(2);
  });

  it('FR-006-13: na ozkem zaslonu (320 px) so vrstice še vedno dostopne kot preglednica', async () => {
    setViewport('narrow');
    render({ pending: outgoing(2) });

    const table = (await section()).getByRole('table', { name: 'Čakajoča povabila' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it.each(['sl', 'en'])('FR-006-13: brez kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = render({
      pending: [
        outgoingInvitation(2, { canWithdraw: false }),
        outgoingInvitation(1, { invitedBy: null }),
      ],
    });

    await screen.findByRole('table', {
      name: language === 'sl' ? 'Čakajoča povabila' : 'Pending invitations',
    });
    expect((await axe(container)).violations).toEqual([]);
  });
});
