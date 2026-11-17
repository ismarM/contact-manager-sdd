import { IconAlertTriangle, IconClockExclamation } from '@tabler/icons-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { focusRing, primaryButton } from '../../shared/ui/styles';
import { useAuth } from './authContext';
import { AuthCard } from './AuthCard';
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
    <AuthCard
      footer={
        <Link
          to="/api-docs"
          className="inline-flex min-h-11 items-center text-primary underline decoration-1 underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t('login.apiDocsLink')}
        </Link>
      }
    >
      <p className="mt-3 text-muted-foreground">{t('login.tagline')}</p>
      {deletedNotice && (
        <p role="status" className="mt-6 rounded-md border border-border bg-muted p-3">
          {t(deletedNotice)}
        </p>
      )}
      {signInError ? (
        <div
          role="alert"
          className="mt-6 flex gap-2 rounded-md border border-border bg-destructive-soft p-3"
        >
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t(AUTH_ERROR_KEYS[signInError])}</span>
        </div>
      ) : (
        sessionExpired && (
          <div
            role="alert"
            className="mt-6 flex gap-2 rounded-md border border-border bg-warning-soft p-3"
          >
            <IconClockExclamation aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{t('login.sessionExpired')}</span>
          </div>
        )
      )}
      <button
        type="button"
        onClick={() => void signIn()}
        className="mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-card px-4 font-bold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-12"
      >
        <GoogleLogo />
        {t('login.signIn')}
      </button>
      <p className="mt-6 flex items-center gap-3 text-muted-foreground" aria-hidden="true">
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
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="mt-6 flex flex-col gap-4"
      >
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
        <AuthField
          id={passwordId}
          label={t('auth.form.password')}
          type="password"
          autoComplete="current-password"
          value={form.values.password}
          error={fieldError('password')}
          onChange={(value) => form.change('password', value)}
          onBlur={() => form.blur('password')}
        />
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {t('auth.login.submit')}
        </button>
      </form>
      <div className="mt-6 flex flex-col gap-2">
        <Link
          to="/forgot-password"
          className={`font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`}
        >
          {t('auth.login.forgot')}
        </Link>
        <Link
          to={withNext('/register')}
          className={`font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`}
        >
          {t('auth.login.register')}
        </Link>
      </div>
    </AuthCard>
  );
}
