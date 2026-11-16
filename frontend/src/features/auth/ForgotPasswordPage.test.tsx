import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { createAuthFake } from '../../test/authFake';
import { renderApp } from '../../test/renderApp';

const t = i18n.t.bind(i18n);

async function requestReset(user: ReturnType<typeof renderApp>['user'], email: string) {
  await user.type(await screen.findByLabelText(t('auth.form.email')), email);
  await user.click(screen.getByRole('button', { name: t('auth.forgot.submit') }));
}

describe('ForgotPasswordPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-017-07: obstoječ in neobstoječ e-naslov dobita isto potrdilo', async () => {
    const gateway = createAuthFake();
    gateway.addPasswordAccount('ana@primer.si', 'geslo-1234');
    const first = renderApp('/forgot-password', { gateway });
    await requestReset(first.user, 'ana@primer.si');
    expect(await screen.findByRole('status')).toHaveTextContent(t('auth.forgot.sent'));
    const existingText = screen.getByRole('status').textContent;
    first.unmount();

    const second = renderApp('/forgot-password', { gateway });
    await requestReset(second.user, 'nihce@primer.si');
    expect(await screen.findByRole('status')).toHaveTextContent(t('auth.forgot.sent'));

    expect(screen.getByRole('status').textContent).toBe(existingText);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(gateway.passwordResets).toEqual(['ana@primer.si', 'nihce@primer.si']);
  });

  it('FR-017-07: brez povezave – napaka, potrdila ni', async () => {
    const gateway = createAuthFake();
    gateway.failNextSignIn('offline');
    const { user } = renderApp('/forgot-password', { gateway });

    await requestReset(user, 'ana@primer.si');

    expect(await screen.findByRole('alert')).toHaveTextContent(t('login.error.offline'));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('FR-017-07: neveljaven e-naslov se ne pošlje', async () => {
    const gateway = createAuthFake();
    const { user } = renderApp('/forgot-password', { gateway });

    await requestReset(user, 'ni-naslov');

    expect(await screen.findByRole('alert')).toHaveTextContent(t('auth.form.errors.emailInvalid'));
    expect(gateway.passwordResets).toEqual([]);
  });

  it('FR-017-22: povezava nazaj na prijavo; brez kršitev axe po oddaji', async () => {
    const { container, user } = renderApp('/forgot-password');
    expect(await screen.findByRole('link', { name: t('auth.forgot.back') })).toHaveAttribute(
      'href',
      '/login',
    );
    await requestReset(user, 'ana@primer.si');
    expect(await screen.findByRole('status')).toHaveTextContent(t('auth.forgot.sent'));

    expect((await axe(container)).violations).toEqual([]);
  });
});
