import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Callout } from '../../shared/ui/Callout';
import { primaryButton, textLink } from '../../shared/ui/styles';
import { AuthAlert, AuthLayout } from './AuthLayout';
import { authErrorKey } from './authErrorKey';
import { AuthField, ErrorSummary, useAuthForm } from './AuthForm';
import { useAuth } from './authContext';

/**
 * *Pozabljeno geslo* (FR-017-07): po oddaji vedno isto potrdilo, ne glede na to, ali račun obstaja. Napaka se pokaže
 * samo, ko zahteve ni bilo mogoče poslati (brez povezave, omejitev pogostosti) – to ne razkrije obstoja računa.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { sendPasswordReset } = useAuth();
  useDocumentTitle(t('auth.forgot.documentTitle'));
  const form = useAuthForm('signIn', ['email']);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();

  const submit = async (event: FormEvent) => {
    setFailure(null);
    setSent(false);
    if (!form.validate(event)) return;
    setBusy(true);
    try {
      await sendPasswordReset(form.values.email.trim());
      setSent(true);
    } catch (error) {
      setFailure(t(authErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const emailError = form.errors.email ? t(`auth.form.errors.${form.errors.email}`) : undefined;

  return (
    <AuthLayout heading={t('auth.forgot.heading')}>
      <p>{t('auth.forgot.intro')}</p>
      {failure && <AuthAlert>{failure}</AuthAlert>}
      {form.summaryVisible && (
        <ErrorSummary
          errors={form.errors}
          fieldIds={{ email: emailId }}
          summaryRef={form.summaryRef}
        />
      )}
      <div role="status" className={sent ? undefined : 'sr-only'}>
        {sent && (
          <Callout tone="success" announce={false}>
            {t('auth.forgot.sent')}
          </Callout>
        )}
      </div>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <AuthField
          id={emailId}
          label={t('auth.form.email')}
          type="email"
          autoComplete="email"
          value={form.values.email}
          error={emailError}
          onChange={(value) => form.change('email', value)}
          onBlur={() => form.blur('email')}
        />
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {t('auth.forgot.submit')}
        </button>
      </form>
      <p>
        <Link to="/login" className={`font-semibold ${textLink}`}>
          {t('auth.forgot.back')}
        </Link>
      </p>
    </AuthLayout>
  );
}
