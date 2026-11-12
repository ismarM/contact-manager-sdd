import { IconAlertTriangle, IconClockExclamation } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { LanguageButtons } from '../../shared/ui/LanguageButtons';
import { useAuth } from './authContext';
import type { SignInErrorCode } from './AuthGateway';
import { GoogleLogo } from './GoogleLogo';
import { safeNextPath } from './safeNextPath';

const ERROR_KEYS = {
  cancelled: 'login.error.cancelled',
  'popup-blocked': 'login.error.popupBlocked',
  offline: 'login.error.offline',
  failed: 'login.error.failed',
} as const satisfies Record<SignInErrorCode, string>;

/** Stran za prijavo (design.md 9.1, FR-001-01, FR-001-04, FR-001-05, FR-001-10, FR-001-15). */
export function LoginPage() {
  const { t } = useTranslation();
  const { status, signIn, signInError, changeLanguage, exitTo, consumeExit } = useAuth();
  const [params] = useSearchParams();
  useDocumentTitle(t('title.login'));
  useEffect(() => {
    if (exitTo) consumeExit();
  }, [exitTo, consumeExit]);

  if (status === 'signedIn') {
    return <Navigate to={safeNextPath(params.get('next'))} replace />;
  }

  const sessionExpired = params.get('reason') === 'session-expired';
  // Ogrodje 012: razlog `account-deleted` / `account-deleted-pending` – sporočilo pride z implementacijo.

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="w-full max-w-[400px] rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <span aria-hidden="true" className="inline-block h-9 w-1 rounded-sm bg-primary" />
          {t('app.name')}
        </h1>
        <p className="mt-3 text-muted-foreground">{t('login.tagline')}</p>
        {signInError ? (
          <div
            role="alert"
            className="mt-6 flex gap-2 rounded-md border-l-4 border-destructive bg-destructive-soft p-3"
          >
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{t(ERROR_KEYS[signInError])}</span>
          </div>
        ) : (
          sessionExpired && (
            <div
              role="alert"
              className="mt-6 flex gap-2 rounded-md border-l-4 border-warning bg-warning-soft p-3"
            >
              <IconClockExclamation
                aria-hidden="true"
                size={20}
                stroke={1.75}
                className="shrink-0"
              />
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
      </div>
      <LanguageButtons onChange={changeLanguage} />
    </main>
  );
}
