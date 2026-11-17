import { IconAlertTriangle, IconCheck, IconKey, IconLock } from '@tabler/icons-react';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Callout } from '../../shared/ui/Callout';
import {
  card,
  fieldError,
  ghostButton,
  primaryButton,
  secondaryButton,
  softButton,
  textInput,
  warningAlert,
} from '../../shared/ui/styles';
import { authErrorKey } from '../auth/authErrorKey';
import { useAuth } from '../auth/authContext';
import { GoogleLogo } from '../auth/GoogleLogo';
import { AuthField, ErrorSummary, useAuthForm } from '../auth/AuthForm';

type Mode = 'idle' | 'password' | 'google' | 'change';

/**
 * Razdelek *Prijavne metode* (FR-017-09 … 11, -24, design.md 9.9): kateri ponudniki so povezani z računom ter *Omogoči prijavo z geslom*
 * (Google račun) in *Dodaj Google* (račun z geslom). Povezovanje je občutljivo: pred njim je ponovna avtentikacija
 * (geslo ali Google); isti Firebase UID, noben nov profil. Napaka ne spremeni ničesar.
 */
export function SignInMethodsSection() {
  const { t } = useTranslation();
  const { user, reauthenticate, linkPassword, linkGoogle, changePassword } = useAuth();
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<'password' | 'google' | 'changed' | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [understoodError, setUnderstoodError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const form = useAuthForm('register', ['password', 'passwordConfirm']);
  const changeForm = useAuthForm('register', ['password', 'passwordConfirm']);
  const ids = {
    password: useId(),
    passwordConfirm: useId(),
    current: useId(),
    currentError: useId(),
    newPassword: useId(),
    newPasswordConfirm: useId(),
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

  const submitChange = async (event: FormEvent) => {
    if (busy) return;
    setCurrentError(null);
    const valid = changeForm.validate(event);
    if (!currentPassword) {
      setCurrentError(t('auth.form.errors.passwordRequired'));
      return;
    }
    if (!valid) return;
    setBusy(true);
    setFailure(null);
    try {
      // Ponovna avtentikacija s trenutnim geslom, nato updatePassword v Firebase SDK (FR-017-24).
      await reauthenticate(currentPassword);
      await changePassword(changeForm.values.password);
      setDone('changed');
      setMode('idle');
    } catch (error) {
      fail(error, setCurrentError);
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
    <section aria-labelledby={headingId} className={`${card} flex flex-col gap-4 p-4 md:p-6`}>
      <h2 id={headingId} className="text-xl font-semibold">
        {t('account.methods.heading')}
      </h2>
      <ul className={`${card} flex flex-col divide-y divide-border`}>
        <MethodRow
          icon={<GoogleLogo />}
          name={t('account.methods.google')}
          linked={hasGoogle}
          linkedLabel={t('account.methods.linked')}
          notLinkedLabel={t('account.methods.notLinked')}
        />
        <MethodRow
          icon={
            <IconLock
              aria-hidden="true"
              size={20}
              stroke={1.75}
              className="text-muted-foreground"
            />
          }
          name={t('account.methods.password')}
          linked={hasPassword}
          linkedLabel={t('account.methods.linked')}
          notLinkedLabel={t('account.methods.notLinked')}
          description={!hasPassword ? t('account.methods.passwordIntro') : undefined}
        />
      </ul>

      <div role="status" className="text-foreground">
        {done && (
          <p className="flex items-center gap-2">
            <IconCheck aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            {t(
              done === 'password'
                ? 'account.methods.passwordAdded'
                : done === 'google'
                  ? 'account.methods.googleAdded'
                  : 'account.methods.passwordChanged',
            )}
          </p>
        )}
      </div>
      {failure && <Callout tone="error">{failure}</Callout>}

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-3">
          {hasPassword && (
            <button type="button" className={secondaryButton} onClick={() => open('change')}>
              <IconKey aria-hidden="true" size={20} stroke={1.75} />
              {t('account.methods.changePassword')}
            </button>
          )}
          {!hasPassword && (
            <button type="button" className={softButton} onClick={() => open('password')}>
              <IconKey aria-hidden="true" size={20} stroke={1.75} />
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
          className="flex flex-col gap-5 rounded-md border border-border p-5"
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
            <button type="button" className={ghostButton} onClick={() => open('idle')}>
              {t('account.methods.cancel')}
            </button>
          </div>
        </form>
      )}

      {mode === 'change' && (
        <form
          noValidate
          onSubmit={(event) => void submitChange(event)}
          className="flex flex-col gap-5 rounded-md border border-border p-5"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.current} className="font-medium">
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
          <AuthField
            id={ids.newPassword}
            label={t('account.methods.newPassword')}
            hint={t('auth.form.passwordHint')}
            type="password"
            autoComplete="new-password"
            value={changeForm.values.password}
            error={
              changeForm.errors.password && t(`auth.form.errors.${changeForm.errors.password}`)
            }
            onChange={(value) => changeForm.change('password', value)}
            onBlur={() => changeForm.blur('password')}
          />
          <AuthField
            id={ids.newPasswordConfirm}
            label={t('account.methods.newPasswordConfirm')}
            type="password"
            autoComplete="new-password"
            value={changeForm.values.passwordConfirm ?? ''}
            error={
              changeForm.errors.passwordConfirm &&
              t(`auth.form.errors.${changeForm.errors.passwordConfirm}`)
            }
            onChange={(value) => changeForm.change('passwordConfirm', value)}
            onBlur={() => changeForm.blur('passwordConfirm')}
          />
          {changeForm.summaryVisible && (
            <ErrorSummary
              errors={changeForm.errors}
              fieldIds={{ password: ids.newPassword, passwordConfirm: ids.newPasswordConfirm }}
              summaryRef={changeForm.summaryRef}
            />
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={primaryButton} aria-busy={busy} aria-disabled={busy}>
              {t('account.methods.changePasswordSubmit')}
            </button>
            <button type="button" className={ghostButton} onClick={() => open('idle')}>
              {t('account.methods.cancel')}
            </button>
          </div>
        </form>
      )}

      {mode === 'google' && (
        <form
          noValidate
          onSubmit={(event) => void addGoogle(event)}
          className="flex flex-col gap-5 rounded-md border border-border p-5"
        >
          <p className="text-muted-foreground">{t('account.methods.reauthPassword')}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.current} className="font-medium">
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
            <button type="button" className={ghostButton} onClick={() => open('idle')}>
              {t('account.methods.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Vrstica prijavne metode: ikona, ime (»Ime: stanje« je v besedilu v tem vrstnem redu), značka stanja in razlaga. */
function MethodRow({
  icon,
  name,
  linked,
  linkedLabel,
  notLinkedLabel,
  description,
}: {
  icon: ReactNode;
  name: string;
  linked: boolean;
  linkedLabel: string;
  notLinkedLabel: string;
  description?: string;
}) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3">
      <span className="row-span-2 grid place-items-center self-center">{icon}</span>
      <span className="col-start-2 font-semibold">
        {name}
        <span className="sr-only">: </span>
      </span>
      <span
        className={`col-start-3 row-span-2 row-start-1 inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-sm ${
          linked ? 'bg-success-soft text-success' : 'border border-border text-muted-foreground'
        }`}
      >
        {linked && <IconCheck aria-hidden="true" size={16} stroke={1.75} />}
        {linked ? linkedLabel : notLinkedLabel}
      </span>
      {description && (
        <span className="col-start-2 text-sm text-muted-foreground">{description}</span>
      )}
    </li>
  );
}
