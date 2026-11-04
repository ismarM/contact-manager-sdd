import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';

import { useAuth } from '../../features/auth/authContext';
import { AccountMenu } from './AccountMenu';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Ogrodje aplikacije (design.md 7.1, FR-001-11): »Preskoči na vsebino« kot prvi element fokusa, zgornja vrstica
 * (56 px) z besednim znakom in menijem računa, sporočilo o neuspelem shranjevanju izbire (FR-001-19) in glavna vsebina.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { saveFailed, dismissSaveFailed } = useAuth();
  const main = useRef<HTMLElement>(null);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
        className={`sr-only rounded-md bg-card px-4 py-2 font-bold text-primary focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 ${focusRing}`}
      >
        {t('shell.skipLink')}
      </a>
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4">
        <Link
          to="/"
          className={`flex min-w-0 items-center gap-2 rounded-md text-xl font-bold text-foreground ${focusRing}`}
        >
          <span
            aria-hidden="true"
            className="inline-block h-6 w-1 shrink-0 rounded-sm bg-primary"
          />
          <span className="truncate">{t('app.name')}</span>
        </Link>
        <AccountMenu />
      </header>
      {saveFailed && (
        <div
          role="alert"
          className="flex items-center gap-2 border-l-4 border-destructive bg-destructive-soft px-4 py-2"
        >
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('shell.saveFailed')}</span>
          <button
            type="button"
            onClick={dismissSaveFailed}
            aria-label={t('shell.dismiss')}
            className={`flex size-11 items-center justify-center rounded-md hover:bg-muted ${focusRing}`}
          >
            <IconX aria-hidden="true" size={20} stroke={1.75} />
          </button>
        </div>
      )}
      <main id="main" ref={main} tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
    </div>
  );
}
