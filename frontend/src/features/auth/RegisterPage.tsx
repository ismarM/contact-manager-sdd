import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { focusRing, primaryButton } from '../../shared/ui/styles';
import { useAuth } from './authContext';
import { AuthAlert, AuthCard } from './AuthCard';
import { authErrorKey } from './authErrorKey';
import { AuthField, ErrorSummary, useAuthForm } from './AuthForm';
import { safeNextPath } from './safeNextPath';

/**
 * Registracija z e-naslovom in geslom (FR-017-01, FR-017-10, FR-017-22): po uspehu Firebase pošlje potrditveno
 * sporočilo in uporabnik pride na zaslon potrditve. Obstoječ e-naslov dobi nevtralno sporočilo (ne razkrije ponudnika).
 */
export function RegisterPage() {
  const { t } = useTranslation();
  const { status, signUpWithPassword } = useAuth();
  const [params] = useSearchParams();
  useDocumentTitle(t('auth.register.documentTitle'));
  const form = useAuthForm('register', ['email', 'password', 'passwordConfirm']);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const next = params.get('next');
  if (status === 'signedIn') return <Navigate to={safeNextPath(next)} replace />;
  if (status === 'unverified') {
    const query = next ? `?${new URLSearchParams({ next }).toString()}` : '';
    return <Navigate to={`/verify-email${query}`} replace />;
  }

  const fieldError = (field: 'email' | 'password' | 'passwordConfirm') => {
    const error = form.errors[field];
    return error ? t(`auth.form.errors.${error}`) : undefined;
  };

  const submit = async (event: FormEvent) => {
    setFailure(null);
    if (!form.validate(event)) return;
    setBusy(true);
    try {
      await signUpWithPassword(form.values.email.trim(), form.values.password);
    } catch (error) {
      setFailure(t(authErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard heading={t('auth.register.heading')}>
      {failure && <AuthAlert>{failure}</AuthAlert>}
      {form.summaryVisible && (
        <ErrorSummary
          errors={form.errors}
          fieldIds={{ email: emailId, password: passwordId, passwordConfirm: confirmId }}
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
          autoComplete="new-password"
          value={form.values.password}
          hint={t('auth.form.passwordHint')}
          error={fieldError('password')}
          onChange={(value) => form.change('password', value)}
          onBlur={() => form.blur('password')}
        />
        <AuthField
          id={confirmId}
          label={t('auth.form.passwordConfirm')}
          type="password"
          autoComplete="new-password"
          value={form.values.passwordConfirm ?? ''}
          error={fieldError('passwordConfirm')}
          onChange={(value) => form.change('passwordConfirm', value)}
          onBlur={() => form.blur('passwordConfirm')}
        />
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {t('auth.register.submit')}
        </button>
      </form>
      <p className="mt-6">
        {t('auth.register.haveAccount')}{' '}
        <Link
          to={next ? `/login?${new URLSearchParams({ next }).toString()}` : '/login'}
          className={`font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`}
        >
          {t('auth.register.signIn')}
        </Link>
      </p>
    </AuthCard>
  );
}
