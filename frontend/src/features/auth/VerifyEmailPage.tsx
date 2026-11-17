import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { primaryButton, secondaryButton } from '../../shared/ui/styles';
import { useAuth } from './authContext';
import { AuthAlert, AuthCard } from './AuthCard';
import { authErrorKey } from './authErrorKey';
import { safeNextPath } from './safeNextPath';

type Notice = { kind: 'status' | 'alert'; text: string };

/**
 * *Potrdi e-naslov* (FR-017-02, FR-017-03, FR-017-13): dokler e-naslov ni potrjen, uporabnik vidi samo ta zaslon.
 * *Potrdil sem* osveži uporabnika in ID žeton; po potrditvi AuthProvider sinhronizira profil in uporabnik vstopi na
 * zahtevano pot brez ponovne prijave.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const {
    status,
    user,
    resendVerification,
    confirmVerification,
    signOut,
    linkedNeedsVerification,
  } = useAuth();
  const [params] = useSearchParams();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(t('auth.verify.documentTitle'));

  if (status === 'signedIn') return <Navigate to={safeNextPath(params.get('next'))} replace />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  if (status !== 'unverified') return null;

  const run = async (action: () => Promise<Notice | null>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (error) {
      setNotice({ kind: 'alert', text: t(authErrorKey(error)) });
    } finally {
      setBusy(false);
    }
  };

  const resend = () =>
    run(async () => {
      await resendVerification();
      return { kind: 'status', text: t('auth.verify.sent') };
    });

  const confirm = () =>
    run(async () =>
      (await confirmVerification()) ? null : { kind: 'alert', text: t('auth.verify.notYet') },
    );

  return (
    <AuthCard heading={t('auth.verify.heading')}>
      {linkedNeedsVerification && (
        <p className="mt-3 rounded-md border-l-4 border-border bg-muted p-3">
          {t('auth.verify.afterLinking', { email: user?.email ?? '' })}
        </p>
      )}
      <p className="mt-3">{t('auth.verify.intro', { email: user?.email ?? '' })}</p>
      {notice?.kind === 'alert' && <AuthAlert>{notice.text}</AuthAlert>}
      <p
        role="status"
        className={
          notice?.kind === 'status'
            ? 'mt-6 rounded-md border-l-4 border-border bg-muted p-3'
            : 'sr-only'
        }
      >
        {notice?.kind === 'status' ? notice.text : ''}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className={`w-full ${primaryButton}`}
        >
          {t('auth.verify.confirm')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resend()}
          className={`w-full ${secondaryButton}`}
        >
          {t('auth.verify.resend')}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className={`w-full ${secondaryButton}`}
        >
          {t('auth.verify.signOut')}
        </button>
      </div>
    </AuthCard>
  );
}
