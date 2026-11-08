import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { renderInvitationsApp } from '../../test/invitationsApi';
import { setViewport } from '../../test/viewport';

// Povezava *Povabila* v zgornji vrstici (FR-006-06; plan.md – Key elements; design.md 7.1).

const count = (n: number) => () => ({ status: 200, body: { count: n } });

describe('InvitationsLink', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-006-06: število 3 – ime »Povabila, 3 nova«, vidno »Povabila (3)«, vodi na /invitations', async () => {
    renderInvitationsApp('/', { count: count(3) });

    const link = await screen.findByRole('link', { name: 'Povabila, 3 nova' });
    expect(link).toHaveTextContent('Povabila (3)');
    expect(link).toHaveAttribute('href', '/invitations');
  });

  it('FR-006-06: brez povabil – ime »Povabila« brez števila', async () => {
    renderInvitationsApp('/', { count: count(0) });

    const link = await screen.findByRole('link', { name: 'Povabila' });
    expect(link).not.toHaveTextContent('(');
  });

  it.each([
    [1, 'Povabila, 1 novo'],
    [2, 'Povabila, 2 novi'],
    [3, 'Povabila, 3 nova'],
    [5, 'Povabila, 5 novih'],
  ])('FR-006-06: množinska oblika za %i povabil', async (n, name) => {
    renderInvitationsApp('/', { count: count(n) });

    expect(await screen.findByRole('link', { name })).toBeInTheDocument();
  });

  it('FR-006-06: v angleščini »Invitations, 3 new«', async () => {
    await i18n.changeLanguage('en');
    renderInvitationsApp('/', { count: count(3) });

    expect(await screen.findByRole('link', { name: 'Invitations, 3 new' })).toBeInTheDocument();
  });

  it('FR-006-06: na ozkem zaslonu (320 px) je povezava še vedno dosegljiva z istim imenom', async () => {
    setViewport('narrow');
    renderInvitationsApp('/', { count: count(3) });

    const link = await screen.findByRole('link', { name: 'Povabila, 3 nova' });
    expect(link).toHaveAttribute('href', '/invitations');
  });

  it('FR-006-06: na poti /invitations ima povezava aria-current="page"', async () => {
    renderInvitationsApp('/invitations', { count: count(2) });

    const link = await screen.findByRole('link', { name: 'Povabila, 2 novi' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('FR-006-06: po prehodu na drugo pot se število ponovno naloži in prikaže novo vrednost', async () => {
    let calls = 0;
    const { user, invitations } = renderInvitationsApp('/', {
      count: () => {
        calls += 1;
        return { status: 200, body: { count: calls === 1 ? 3 : 1 } };
      },
    });
    await user.click(await screen.findByRole('link', { name: 'Povabila, 3 nova' }));

    expect(await screen.findByRole('link', { name: 'Povabila, 1 novo' })).toBeInTheDocument();
    await waitFor(() =>
      expect(invitations.of('GET', '/api/invitations/count').length).toBeGreaterThanOrEqual(2),
    );
  });

  it.each(['sl', 'en'])('FR-006-06: brez kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = renderInvitationsApp('/', { count: count(3) });

    await screen.findByRole('link', {
      name: language === 'sl' ? 'Povabila, 3 nova' : 'Invitations, 3 new',
    });
    expect((await axe(container)).violations).toEqual([]);
  });
});
