import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { server } from '../../test/msw';
import { currentLocation, mockProfileApi, renderApp } from '../../test/renderApp';

const t = i18n.t.bind(i18n);
const EMAIL = 'nova@primer.si';

/** Prijavljen uporabnik z geslom, katerega e-naslov še ni potrjen. */
function unverifiedGateway() {
  const gateway = createAuthFake();
  gateway.addPasswordAccount(EMAIL, 'geslo-1234', { verified: false });
  void gateway.signInWithPassword(EMAIL, 'geslo-1234');
  return gateway;
}

const heading = () => screen.findByRole('heading', { level: 1, name: t('auth.verify.heading') });

describe('VerifyEmailPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-017-02: nepotrjen uporabnik na zaščiteni poti vidi samo zaslon potrditve, API se ne kliče', async () => {
    const api = mockProfileApi();
    renderApp('/account?x=1', { gateway: unverifiedGateway() });

    expect(await heading()).toBeVisible();
    expect(currentLocation()).toBe('/verify-email?next=%2Faccount%3Fx%3D1');
    expect(screen.getByText(new RegExp(EMAIL))).toBeVisible();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(api.requests).toEqual([]);
  });

  it('FR-017-13: »Potrdil sem« pred potrditvijo – obvestilo, uporabnik ostane, PUT /api/me ni poslan', async () => {
    const api = mockProfileApi();
    const { user } = renderApp('/verify-email', { gateway: unverifiedGateway() });

    await user.click(await screen.findByRole('button', { name: t('auth.verify.confirm') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('auth.verify.notYet'));
    expect(currentLocation()).toBe('/verify-email');
    expect(api.requests).toEqual([]);
  });

  it('FR-017-03 FR-017-04 FR-017-13: po potrditvi »Potrdil sem« sinhronizira profil in vodi na next brez ponovne prijave', async () => {
    const api = mockProfileApi({
      profile: { name: null, email: EMAIL, language: null, theme: null },
    });
    const gateway = unverifiedGateway();
    const { user } = renderApp('/account?x=1', { gateway });
    await heading();

    gateway.verifyEmail(EMAIL);
    await user.click(screen.getByRole('button', { name: t('auth.verify.confirm') }));

    await waitFor(() => expect(currentLocation()).toBe('/account?x=1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Moj račun' })).toBeVisible();
    const sync = api.requests.filter((r) => r.method === 'PUT' && r.path === '/api/me');
    expect(sync).toHaveLength(1);
    expect(sync[0]?.authorization).toBe(`Bearer token-uid-${EMAIL}`);
    expect(gateway.signOutCalls).toBe(0);
  });

  it('FR-017-03: »Ponovno pošlji« pošlje sporočilo; omejitev pogostosti prikaže napako', async () => {
    const gateway = unverifiedGateway();
    const { user } = renderApp('/verify-email', { gateway });

    await user.click(await screen.findByRole('button', { name: t('auth.verify.resend') }));
    expect(await screen.findByRole('status')).toHaveTextContent(t('auth.verify.sent'));
    expect(gateway.verificationEmails).toBe(1);

    gateway.failNextSignIn('too-many-requests');
    await user.click(screen.getByRole('button', { name: t('auth.verify.resend') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('auth.error.tooManyRequests'));
    expect(gateway.verificationEmails).toBe(1);
  });

  it('FR-017-02: »Odjava« odjavi in vodi na prijavo', async () => {
    const gateway = unverifiedGateway();
    const { user } = renderApp('/verify-email', { gateway });

    await user.click(await screen.findByRole('button', { name: t('auth.verify.signOut') }));

    await waitFor(() => expect(currentLocation()).toBe('/login'));
    expect(gateway.signOutCalls).toBe(1);
  });

  it('FR-017-02: odgovor 403 EMAIL_NOT_VERIFIED pri sinhronizaciji vodi na zaslon potrditve, seja ostane', async () => {
    const requests: string[] = [];
    server.use(
      http.put('/api/me', ({ request }) => {
        requests.push(request.method);
        return HttpResponse.json({ code: 'EMAIL_NOT_VERIFIED' }, { status: 403 });
      }),
    );
    const gateway = createAuthFake({ user: ANA });
    renderApp('/', { gateway });

    expect(await heading()).toBeVisible();
    expect(currentLocation()).toBe('/verify-email?next=%2F');
    expect(requests).toEqual(['PUT']);
    expect(gateway.signOutCalls).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-017-02: brez prijave /verify-email vodi na prijavo', async () => {
    renderApp('/verify-email');

    await waitFor(() => expect(currentLocation()).toBe('/login'));
  });

  it('FR-017-22: zaslon potrditve nima kršitev axe (sl in en, z obvestilom)', async () => {
    const { container, user } = renderApp('/verify-email', { gateway: unverifiedGateway() });
    await user.click(await screen.findByRole('button', { name: t('auth.verify.confirm') }));
    await screen.findByRole('alert');
    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('button', { name: 'I have verified' })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });
});
