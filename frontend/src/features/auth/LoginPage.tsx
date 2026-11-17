import { type FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Callout } from '../../shared/ui/Callout';
import { primaryButton, secondaryButton, textLink } from '../../shared/ui/styles';
import { useAuth } from './authContext';
import { AuthLayout } from './AuthLayout';
import { AUTH_ERROR_KEYS } from './authErrorKey';
import { AuthField, ErrorSummary, useAuthForm } from './AuthForm';
import { GoogleLogo } from './GoogleLogo';
import { safeNextPath } from './safeNextPath';

/**
 * Stran za prijavo (design.md 9.1, FR-001-01, FR-001-04, FR-001-05, FR-001-10, FR-001-15): prijava z Googlom kot
 * doslej (FR-017-08) in z e-naslovom in geslom (FR-017-05) z enim nevtralnim sporočilom ob neuspehu (FR-017-06);
 * povezavi na registracijo in pozabljeno geslo. Ciljna pot `next` velja za oba načina.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { status, signIn, signInWithPassword, signInError, exitTo, consumeExit } = useAuth();
  const [params] = useSearchParams();
  useDocumentTitle(t('title.login'));
  useEffect(() => {
    if (exitTo) consumeExit();
  }, [exitTo, consumeExit]);
  const form = useAuthForm('signIn', ['email', 'password']);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();

  const next = params.get('next');
  if (status === 'signedIn') {
    return <Navigate to={safeNextPath(next)} replace />;
  }
  if (status === 'unverified') {
    const query = next ? `?${new URLSearchParams({ next }).toString()}` : '';
    return <Navigate to={`/verify-email${query}`} replace />;
  }
  const withNext = (path: string) =>
    next ? `${path}?${new URLSearchParams({ next }).toString()}` : path;

  const submit = async (event: FormEvent) => {
    if (!form.validate(event)) return;
    setBusy(true);
    try {
      await signInWithPassword(form.values.email.trim(), form.values.password);
    } finally {
      setBusy(false);
    }
  };
  const fieldError = (field: 'email' | 'password') => {
    const error = form.errors[field];
    return error ? t(`auth.form.errors.${error}`) : undefined;
  };

  const sessionExpired = params.get('reason') === 'session-expired';
  // Potrdilo po izbrisu računa (012, FR-012-14, FR-012-17); `pending` = brisanje povezave z Google računom še poteka.
  const reason = params.get('reason');
  const deletedNotice =
    reason === 'account-deleted'
      ? 'login.accountDeleted'
      : reason === 'account-deleted-pending'
        ? 'login.accountDeletedPending'
        : null;

  return (
    <AuthLayout
      heading={t('auth.login.heading')}
      hero={{ title: t('login.tagline'), text: t('auth.hero.loginText') }}
      footer={
        <Link to="/api-docs" className={`inline-flex min-h-11 items-center ${textLink}`}>
          {t('login.apiDocsLink')}
        </Link>
      }
    >
      {deletedNotice && <Callout tone="info">{t(deletedNotice)}</Callout>}
      {signInError ? (
        <Callout tone="error">{t(AUTH_ERROR_KEYS[signInError])}</Callout>
      ) : (
        sessionExpired && (
          <Callout tone="warning" role="alert">
            {t('login.sessionExpired')}
          </Callout>
        )
      )}
      <button type="button" onClick={() => void signIn()} className={`w-full ${secondaryButton}`}>
        <GoogleLogo />
        {t('login.signIn')}
      </button>
      <p className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {t('auth.login.or')}
        <span className="h-px flex-1 bg-border" />
      </p>
      {form.summaryVisible && (
        <ErrorSummary
          errors={form.errors}
          fieldIds={{ email: emailId, password: passwordId }}
          summaryRef={form.summaryRef}
        />
      )}
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <AuthField
          id={emailId}
          label={t('auth.form.email')}
          type="email"
          autoComplete="email"
          value={form.values.email}
          error={fieldError('email')}
          onChange={(value) => form.change('email', value)}
          onBlur={() => form.blur('email')}
        />
        <div className="flex flex-col gap-1">
          <AuthField
            id={passwordId}
            label={t('auth.form.password')}
            type="password"
            autoComplete="current-password"
            value={form.values.password}
            error={fieldError('password')}
            revealable
            onChange={(value) => form.change('password', value)}
            onBlur={() => form.blur('password')}
          />
          <Link to="/forgot-password" className={`self-end text-sm ${textLink}`}>
            {t('auth.login.forgot')}
          </Link>
        </div>
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {t('auth.login.submit')}
        </button>
      </form>
      <p className="text-center">
        <Link to={withNext('/register')} className={`font-semibold ${textLink}`}>
          {t('auth.login.register')}
        </Link>
      </p>
    </AuthLayout>
  );
}
