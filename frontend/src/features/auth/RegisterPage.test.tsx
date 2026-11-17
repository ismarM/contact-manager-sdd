import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { createAuthFake } from '../../test/authFake';
import { currentLocation, mockProfileApi, renderApp } from '../../test/renderApp';

const t = i18n.t.bind(i18n);
const EMAIL = 'nova@primer.si';

async function fill(
  user: ReturnType<typeof renderApp>['user'],
  values: { email?: string; password?: string; confirm?: string },
) {
  if (values.email !== undefined) {
    await user.type(await screen.findByLabelText(t('auth.form.email')), values.email);
  }
  if (values.password !== undefined) {
    await user.type(screen.getByLabelText(t('auth.form.password')), values.password);
  }
  if (values.confirm !== undefined) {
    await user.type(screen.getByLabelText(t('auth.form.passwordConfirm')), values.confirm);
  }
}

describe('RegisterPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-017-01 FR-017-02: registracija pošlje potrditev in vodi na zaslon potrditve brez PUT /api/me', async () => {
    const api = mockProfileApi();
    const gateway = createAuthFake();
    const { user } = renderApp('/register', { gateway });

    await fill(user, { email: EMAIL, password: 'geslo-1234', confirm: 'geslo-1234' });
    await user.click(screen.getByRole('button', { name: t('auth.register.submit') }));

    expect(
      await screen.findByRole('heading', { level: 1, name: t('auth.verify.heading') }),
    ).toBeVisible();
    expect(currentLocation()).toBe('/verify-email');
    expect(gateway.currentUser).toMatchObject({ email: EMAIL, emailVerified: false });
    expect(gateway.verificationEmails).toBe(1);
    expect(api.requests).toEqual([]);
  });

  it('FR-017-01 FR-017-22: prazna oddaja – povzetek napak dobi fokus, napake so povezane s polji', async () => {
    const gateway = createAuthFake();
    const { user } = renderApp('/register', { gateway });
    await screen.findByLabelText(t('auth.form.email'));

    await user.click(screen.getByRole('button', { name: t('auth.register.submit') }));

    const summary = await screen.findByRole('alert');
    await waitFor(() => expect(summary).toHaveFocus());
    expect(summary).toHaveTextContent(t('auth.form.errors.emailRequired'));
    expect(summary).toHaveTextContent(t('auth.form.errors.passwordRequired'));
    const email = screen.getByLabelText(t('auth.form.email'));
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(t('auth.form.errors.emailRequired'));
    expect(gateway.currentUser).toBeNull();
  });

  it('FR-017-01: geslo s 7 znaki je prekratko, z 8 znaki sprejeto; gesli se morata ujemati', async () => {
    const gateway = createAuthFake();
    const { user } = renderApp('/register', { gateway });

    await fill(user, { email: EMAIL, password: '1234567', confirm: '1234567' });
    await user.click(screen.getByRole('button', { name: t('auth.register.submit') }));
    expect(screen.getByLabelText(t('auth.form.password'))).toHaveAccessibleDescription(
      `${t('auth.form.passwordHint')} ${t('auth.form.errors.passwordTooShort')}`,
    );
    expect(gateway.currentUser).toBeNull();

    await user.type(screen.getByLabelText(t('auth.form.password')), '8');
    await user.click(screen.getByRole('button', { name: t('auth.register.submit') }));
    expect(screen.getByLabelText(t('auth.form.passwordConfirm'))).toHaveAccessibleDescription(
      t('auth.form.errors.passwordMismatch'),
    );
    expect(gateway.currentUser).toBeNull();

    await user.type(screen.getByLabelText(t('auth.form.passwordConfirm')), '8');
    await user.click(screen.getByRole('button', { name: t('auth.register.submit') }));
    await waitFor(() => expect(currentLocation()).toBe('/verify-email'));
  });

  it('FR-017-10: obstoječ e-naslov – nevtralno sporočilo, drug račun ne nastane', async () => {
    const api = mockProfileApi();
    const gateway = createAuthFake();
    gateway.addPasswordAccount(EMAIL, 'drugo-geslo');
    const { user } = renderApp('/register', { gateway });

    await fill(user, { email: EMAIL, password: 'geslo-1234', confirm: 'geslo-1234' });
    await user.click(screen.getByRole('button', { name: t('auth.register.submit') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('auth.error.emailInUse'));
    expect(gateway.currentUser).toBeNull();
    expect(currentLocation()).toBe('/register');
    expect(api.requests).toEqual([]);
  });

  it('FR-017-22: angleška besedila in povezava na prijavo ohrani next', async () => {
    await i18n.changeLanguage('en');
    renderApp('/register?next=%2Faccount');

    expect(await screen.findByRole('heading', { level: 1, name: 'Create account' })).toBeVisible();
    expect(screen.getByLabelText('Repeat password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Faccount',
    );
  });

  it('FR-017-22: stran za registracijo nima kršitev axe (tudi z napakami)', async () => {
    const { container, user } = renderApp('/register');
    await fill(user, { email: 'ni-naslov', password: '123' });
    await user.click(screen.getByRole('button', { name: t('auth.register.submit') }));
    await screen.findByRole('alert');

    expect((await axe(container)).violations).toEqual([]);
  });
});
