import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  received,
  receivedInvitation,
  receivedReply,
  renderInvitationsApp,
} from '../../test/invitationsApi';

// Stran *Povabila* – seznam prejetih povabil (FR-006-05, FR-006-07; plan.md – Key elements; design.md 8.5, 9.8).

const PATH = '/invitations';

describe('InvitationsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-006-05: naslov zaslona, naslov strani in seznam z dvema povabiloma, novejše prvo', async () => {
    renderInvitationsApp(PATH, { listReceived: receivedReply(received(2)) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Povabila' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Povabila – Kontakti'));
    const list = await screen.findByRole('list', { name: 'Prejeta povabila' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole('heading', { level: 2 })).toHaveTextContent('Skupina 002');
    expect(within(items[1]!).getByRole('heading', { level: 2 })).toHaveTextContent('Skupina 001');
  });

  it('FR-006-05: vrstica – skupina, povabitelj, vloga in datum', async () => {
    renderInvitationsApp(PATH, {
      listReceived: receivedReply([receivedInvitation(1, { role: 'EDITOR' })]),
    });

    const item = within(await screen.findByRole('list', { name: 'Prejeta povabila' })).getByRole(
      'listitem',
    );
    expect(
      within(item).getByRole('heading', { level: 2, name: 'Projekt FERI' }),
    ).toBeInTheDocument();
    expect(item).toHaveTextContent('Povabil(a): Ana Novak');
    expect(item).toHaveTextContent('Vloga: Urednik');
    expect(item).toHaveTextContent('5. 11. 2026');
    expect(item).not.toHaveTextContent('2026-11-05');
  });

  it('FR-006-05: v angleščini »Invited by: …«, »Role: Editor« in datum v angleškem zapisu', async () => {
    await i18n.changeLanguage('en');
    renderInvitationsApp(PATH, { listReceived: receivedReply([receivedInvitation(1)]) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invitations' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Invitations – Contacts'));
    const item = within(
      await screen.findByRole('list', { name: 'Received invitations' }),
    ).getByRole('listitem');
    expect(item).toHaveTextContent('Invited by: Ana Novak');
    expect(item).toHaveTextContent('Role: Editor');
    expect(item).toHaveTextContent('5 Nov 2026');
  });

  it('FR-006-07: izbrisan povabitelj – »Povabil(a): izbrisan uporabnik« (ležeče)', async () => {
    renderInvitationsApp(PATH, {
      listReceived: receivedReply([receivedInvitation(1, { invitedBy: null })]),
    });

    const item = within(await screen.findByRole('list', { name: 'Prejeta povabila' })).getByRole(
      'listitem',
    );
    expect(item).toHaveTextContent('Povabil(a): izbrisan uporabnik');
  });

  it('FR-006-07: povabilo v arhivirano skupino – oznaka, razlaga in oba gumba', async () => {
    renderInvitationsApp(PATH, {
      listReceived: receivedReply([
        receivedInvitation(1, {
          group: { id: 'g1', title: 'Konferenca', color: 'morje', archived: true },
        }),
      ]),
    });

    const item = within(await screen.findByRole('list', { name: 'Prejeta povabila' })).getByRole(
      'listitem',
    );
    expect(item).toHaveTextContent('Arhivirano');
    expect(item).toHaveTextContent(
      'Skupina je arhivirana – po sprejemu jo boš lahko le pregledoval(a).',
    );
    expect(
      within(item).getByRole('button', { name: 'Sprejmi povabilo v skupino Konferenca' }),
    ).toBeInTheDocument();
    expect(
      within(item).getByRole('button', { name: 'Zavrni povabilo v skupino Konferenca' }),
    ).toBeInTheDocument();
  });

  it('FR-006-05: nearhivirana skupina nima oznake Arhivirano', async () => {
    renderInvitationsApp(PATH, { listReceived: receivedReply([receivedInvitation(1)]) });

    const item = within(await screen.findByRole('list', { name: 'Prejeta povabila' })).getByRole(
      'listitem',
    );
    expect(item).not.toHaveTextContent('Arhivirano');
  });

  it('FR-006-05: 30 povabil – paginacija »Strani rezultatov: Povabila«, »1–25 od 30«, Naslednja zahteva page=1&size=25', async () => {
    const { user, invitations } = renderInvitationsApp(PATH, {
      listReceived: receivedReply(received(30)),
    });

    const nav = await screen.findByRole('navigation', { name: 'Strani rezultatov: Povabila' });
    expect(within(nav).getByRole('status')).toHaveTextContent('1–25 od 30');
    await user.click(within(nav).getByRole('button', { name: 'Naslednja' }));

    await waitFor(() =>
      expect(
        invitations
          .of('GET', '/api/invitations')
          .some((r) => r.search.get('page') === '1' && r.search.get('size') === '25'),
      ).toBe(true),
    );
    expect(
      within(await screen.findByRole('list', { name: 'Prejeta povabila' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(5);
  });

  it('FR-006-05: izbira velikosti strani 50 zahteva size=50', async () => {
    const { user, invitations } = renderInvitationsApp(PATH, {
      listReceived: receivedReply(received(30)),
    });
    const nav = await screen.findByRole('navigation', { name: 'Strani rezultatov: Povabila' });

    await user.selectOptions(within(nav).getByRole('combobox', { name: 'Velikost strani' }), '50');

    await waitFor(() =>
      expect(
        invitations.of('GET', '/api/invitations').some((r) => r.search.get('size') === '50'),
      ).toBe(true),
    );
  });

  it('FR-006-05: prazno stanje – naslov in razlaga', async () => {
    renderInvitationsApp(PATH, { listReceived: receivedReply([]) });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nimaš novih povabil.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent(
      'Ko te kdo povabi v skupino, bo povabilo tukaj.',
    );
  });

  it('FR-006-05: nalaganje prikaže status »Nalagam…«', async () => {
    renderInvitationsApp(PATH, {
      listReceived: async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return receivedReply([])(new URL('http://localhost/api/invitations'));
      },
    });

    expect(await screen.findByRole('status', {}, { timeout: 2000 })).toHaveTextContent('Nalagam…');
  });

  it('FR-006-05: napaka nalaganja – alert in Poskusi znova ponovi zahtevek', async () => {
    let calls = 0;
    const { user, invitations } = renderInvitationsApp(PATH, {
      listReceived: (url) => {
        calls += 1;
        return calls === 1
          ? { status: 500, body: { code: 'INTERNAL' } }
          : receivedReply(received(1))(url);
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Povabil ni bilo mogoče naložiti. Poskusi znova.',
    );
    await user.click(screen.getByRole('button', { name: 'Poskusi znova' }));

    expect(await screen.findByRole('list', { name: 'Prejeta povabila' })).toBeInTheDocument();
    expect(invitations.of('GET', '/api/invitations')).toHaveLength(2);
  });

  it.each(['sl', 'en'])('FR-006-05: brez kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = renderInvitationsApp(PATH, {
      listReceived: receivedReply([
        receivedInvitation(2),
        receivedInvitation(1, {
          group: { id: 'g1', title: 'Konferenca', color: 'morje', archived: true },
          invitedBy: null,
        }),
      ]),
    });

    await screen.findByRole('list', {
      name: language === 'sl' ? 'Prejeta povabila' : 'Received invitations',
    });
    expect((await axe(container)).violations).toEqual([]);
  });
});
