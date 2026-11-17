import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { createAuthFake } from '../../test/authFake';
import { currentLocation, mockProfileApi, renderApp } from '../../test/renderApp';

const t = i18n.t.bind(i18n);
const EMAIL = 'ana.geslo@primer.si';
const GESLO = 'geslo-1234';

async function signInWithPassword(
  user: ReturnType<typeof renderApp>['user'],
  email: string,
  password: string,
) {
  await user.type(await screen.findByLabelText(t('auth.form.email')), email);
  await user.type(screen.getByLabelText(t('auth.form.password')), password);
  await user.click(screen.getByRole('button', { name: t('auth.login.submit') }));
}

describe('LoginPage – prijava z geslom', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-017-05: potrjen račun z geslom vstopi in pristane na poti next (001)', async () => {
    const api = mockProfileApi({
      profile: { name: null, email: EMAIL, language: null, theme: null },
    });
    const gateway = createAuthFake();
    gateway.addPasswordAccount(EMAIL, GESLO);
    const { user } = renderApp('/login?next=%2Faccount%3Fx%3D1', { gateway });

    await signInWithPassword(user, EMAIL, GESLO);

    await waitFor(() => expect(currentLocation()).toBe('/account?x=1'));
    const sync = api.requests.filter((r) => r.method === 'PUT' && r.path === '/api/me');
    expect(sync).toHaveLength(1);
    expect(sync[0]?.authorization).toBe(`Bearer token-uid-${EMAIL}`);
  });

  it('FR-017-06: napačno geslo in neobstoječ račun dobita isto sporočilo, ki ne razkrije obstoja računa', async () => {
    const gateway = createAuthFake();
    gateway.addPasswordAccount(EMAIL, GESLO);
    const first = renderApp('/login', { gateway });
    await signInWithPassword(first.user, EMAIL, 'napacno-geslo');
    const wrongPassword = (await screen.findByRole('alert')).textContent;
    first.unmount();

    const second = renderApp('/login', { gateway });
    await signInWithPassword(second.user, 'nihce@primer.si', GESLO);
    const unknownAccount = (await screen.findByRole('alert')).textContent;

    expect(wrongPassword).toBe(t('auth.error.invalidCredentials'));
    expect(unknownAccount).toBe(wrongPassword);
    expect(gateway.currentUser).toBeNull();
    expect(currentLocation()).toBe('/login');
  });

  it('FR-017-02: račun z nepotrjenim e-naslovom gre na zaslon potrditve z ohranjeno potjo next', async () => {
    const api = mockProfileApi();
    const gateway = createAuthFake();
    gateway.addPasswordAccount(EMAIL, GESLO, { verified: false });
    const { user } = renderApp('/login?next=%2Finvitations', { gateway });

    await signInWithPassword(user, EMAIL, GESLO);

    await waitFor(() => expect(currentLocation()).toBe('/verify-email?next=%2Finvitations'));
    expect(api.requests).toEqual([]);
  });

  it('FR-017-05 FR-017-22: prazna oddaja – napake ob poljih, brez klica ponudnika', async () => {
    const gateway = createAuthFake();
    const { user } = renderApp('/login', { gateway });
    await screen.findByLabelText(t('auth.form.email'));

    await user.click(screen.getByRole('button', { name: t('auth.login.submit') }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent(t('auth.form.errors.emailRequired'));
    expect(screen.getByLabelText(t('auth.form.password'))).toHaveAccessibleDescription(
      t('auth.form.errors.passwordRequired'),
    );
    expect(gateway.currentUser).toBeNull();
  });

  it('FR-017-22: stran za prijavo z napako prijave z geslom nima kršitev axe', async () => {
    const { container, user } = renderApp('/login');
    await signInWithPassword(user, EMAIL, 'napacno-geslo');
    await screen.findByRole('alert');

    expect((await axe(container)).violations).toEqual([]);
  });
});
