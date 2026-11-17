import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  errorAlert,
  fieldError,
  primaryButton,
  secondaryButton,
  textInput,
  warningAlert,
} from '../../shared/ui/styles';
import { authErrorKey } from '../auth/authErrorKey';
import { useAuth } from '../auth/authContext';
import { AuthField, ErrorSummary, useAuthForm } from '../auth/AuthForm';

type Mode = 'idle' | 'password' | 'google';

/**
 * Razdelek *Prijavne metode* (FR-017-09 … 11, design.md 9.9): kateri ponudniki so povezani z računom ter *Dodaj geslo*
 * (Google račun) in *Dodaj Google* (račun z geslom). Povezovanje je občutljivo: pred njim je ponovna avtentikacija
 * (geslo ali Google); isti Firebase UID, noben nov profil. Napaka ne spremeni ničesar.
 */
export function SignInMethodsSection() {
  const { t } = useTranslation();
  const { user, reauthenticate, linkPassword, linkGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<'password' | 'google' | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [understoodError, setUnderstoodError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const form = useAuthForm('register', ['password', 'passwordConfirm']);
  const ids = {
    password: useId(),
    passwordConfirm: useId(),
    current: useId(),
    currentError: useId(),
  };
  const headingId = useId();

  if (!user) return null;
  const hasPassword = user.providers.includes('password');
  const hasGoogle = user.providers.includes('google.com');

  const open = (next: Mode) => {
    setMode(next);
    setFailure(null);
    setDone(null);
    setCurrentPassword('');
    setCurrentError(null);
    setUnderstood(false);
    setUnderstoodError(false);
  };

  const fail = (error: unknown, onCredentials?: (message: string) => void) => {
    const key = authErrorKey(error);
    if (key === 'auth.error.invalidCredentials' && onCredentials) onCredentials(t(key));
    else setFailure(t(key));
  };

  const addPassword = async (event: FormEvent) => {
    if (busy || !form.validate(event)) return;
    if (!understood) {
      setUnderstoodError(true);
      return;
    }
    setUnderstoodError(false);
    setBusy(true);
    setFailure(null);
    try {
      // Ponovna avtentikacija z Googlom (pojavno okno se odpre iz tega klika), nato povezovanje.
      await reauthenticate();
      await linkPassword(form.values.password);
      setDone('password');
      setMode('idle');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const addGoogle = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setCurrentError(null);
    if (!currentPassword) {
      setCurrentError(t('auth.form.errors.passwordRequired'));
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await reauthenticate(currentPassword);
      await linkGoogle();
      setDone('google');
      setMode('idle');
    } catch (error) {
      fail(error, setCurrentError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-xl font-bold">
        {t('account.methods.heading')}
      </h2>
      <ul className="flex flex-col gap-1">
        <li>
          {t('account.methods.google')}:{' '}
          {t(hasGoogle ? 'account.methods.linked' : 'account.methods.notLinked')}
        </li>
        <li>
          {t('account.methods.password')}:{' '}
          {t(hasPassword ? 'account.methods.linked' : 'account.methods.notLinked')}
        </li>
      </ul>

      <div role="status" className="text-foreground">
        {done && (
          <p className="flex items-center gap-2">
            <IconCheck aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            {t(
              done === 'password' ? 'account.methods.passwordAdded' : 'account.methods.googleAdded',
            )}
          </p>
        )}
      </div>
      {failure && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{failure}</span>
        </div>
      )}

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-3">
          {!hasPassword && (
            <button type="button" className={secondaryButton} onClick={() => open('password')}>
              {t('account.methods.addPassword')}
            </button>
          )}
          {!hasGoogle && (
            <button type="button" className={secondaryButton} onClick={() => open('google')}>
              {t('account.methods.addGoogle')}
            </button>
          )}
        </div>
      )}

      {mode === 'password' && (
        <form
          noValidate
          onSubmit={(event) => void addPassword(event)}
          className="flex flex-col gap-4"
        >
          <div role="note" className={warningAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <p>{t('account.methods.verifyWarning', { email: user.email ?? '' })}</p>
          </div>
          <p className="text-muted-foreground">{t('account.methods.reauthGoogle')}</p>
          <AuthField
            id={`${ids.password}-email`}
            label={t('auth.form.email')}
            type="email"
            autoComplete="username"
            value={user.email ?? ''}
            readOnly
            onChange={() => undefined}
            onBlur={() => undefined}
          />
          <AuthField
            id={ids.password}
            label={t('auth.form.password')}
            hint={t('auth.form.passwordHint')}
            type="password"
            autoComplete="new-password"
            value={form.values.password}
            error={form.errors.password && t(`auth.form.errors.${form.errors.password}`)}
            onChange={(value) => form.change('password', value)}
            onBlur={() => form.blur('password')}
          />
          <AuthField
            id={ids.passwordConfirm}
            label={t('auth.form.passwordConfirm')}
            type="password"
            autoComplete="new-password"
            value={form.values.passwordConfirm ?? ''}
            error={
              form.errors.passwordConfirm && t(`auth.form.errors.${form.errors.passwordConfirm}`)
            }
            onChange={(value) => form.change('passwordConfirm', value)}
            onBlur={() => form.blur('passwordConfirm')}
          />
          {form.summaryVisible && (
            <ErrorSummary
              errors={form.errors}
              fieldIds={{ password: ids.password, passwordConfirm: ids.passwordConfirm }}
              summaryRef={form.summaryRef}
            />
          )}
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-1 size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {t('account.methods.verifyUnderstood')}
          </label>
          {understoodError && (
            <p className={fieldError} role="alert">
              {t('account.methods.verifyUnderstoodRequired')}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={primaryButton} aria-busy={busy} aria-disabled={busy}>
              {t('account.methods.addPasswordSubmit')}
            </button>
            <button type="button" className={secondaryButton} onClick={() => open('idle')}>
              {t('account.methods.cancel')}
            </button>
          </div>
        </form>
      )}

      {mode === 'google' && (
        <form
          noValidate
          onSubmit={(event) => void addGoogle(event)}
          className="flex flex-col gap-4"
        >
          <p className="text-muted-foreground">{t('account.methods.reauthPassword')}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.current} className="font-bold">
              {t('account.methods.currentPassword')}
            </label>
            <input
              id={ids.current}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              aria-required="true"
              aria-invalid={currentError !== null}
              aria-describedby={currentError ? ids.currentError : undefined}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={`h-11 ${textInput}`}
            />
            {currentError && (
              <p id={ids.currentError} className={fieldError}>
                {currentError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={primaryButton} aria-busy={busy} aria-disabled={busy}>
              {t('account.methods.addGoogleSubmit')}
            </button>
            <button type="button" className={secondaryButton} onClick={() => open('idle')}>
              {t('account.methods.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
