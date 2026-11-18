import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';

import { useAuth } from '../../features/auth/authContext';
import { CurrentGroupContext } from '../../features/groups/currentGroup';
import { GroupsProvider } from '../../features/groups/GroupsProvider';
import type { GroupDetail } from '../../features/groups/types';
import { InvitationsProvider } from '../../features/invitations/InvitationsProvider';
import { TABLET, useMediaQuery, WIDE } from '../lib/useMediaQuery';
import { Toaster } from '../ui/sonner';
import { focusRing } from '../ui/styles';
import { AccountMenu } from './AccountMenu';
import { BottomBar } from './BottomBar';
import { NavSheet } from './NavSheet';
import { Sidebar, Wordmark } from './Sidebar';
import { useNavCounts } from './useNavCounts';

/**
 * Ogrodje aplikacije (design.md 7.1; FR-001-11, FR-020-05, -07, -09): »Preskoči na vsebino« kot prvi element fokusa;
 * od 1024 px stalna stranska vrstica brez zgornje vrstice; pod tem zgornja vrstica (56 px) z gumbom ploskve, besedno
 * znamko in menijem računa, pod 640 px še spodnja vrstica s štirimi postavkami. Sporočilo o neuspelem shranjevanju
 * izbire (FR-001-19), glavna vsebina (do `--k-content-max`) in obvestila (Sonner). Stikala teme v glavi ni.
 */
export function AppShell() {
  const [current, setCurrent] = useState<GroupDetail | null>(null);
  const group = useMemo(() => ({ current, setCurrent }), [current]);
  return (
    <GroupsProvider>
      <InvitationsProvider>
        <CurrentGroupContext.Provider value={group}>
          <Shell />
        </CurrentGroupContext.Provider>
      </InvitationsProvider>
    </GroupsProvider>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { saveFailed, dismissSaveFailed } = useAuth();
  const wide = useMediaQuery(WIDE);
  const tablet = useMediaQuery(TABLET);
  const main = useRef<HTMLElement>(null);
  const counts = useNavCounts();
  const bottomBar = !tablet;

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
      {!wide && (
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-2">
          <div className="flex min-w-0 items-center gap-1">
            <NavSheet counts={counts} />
            <Wordmark />
          </div>
          <AccountMenu variant="avatar" />
        </header>
      )}
      {saveFailed && (
        <div
          role="alert"
          className="flex items-center gap-2 border border-border bg-destructive-soft px-4 py-2"
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
      <div className="flex flex-1">
        {wide && (
          <aside className="sticky top-0 h-dvh w-[var(--k-sidebar-w)] shrink-0 self-start border-r border-border">
            <Sidebar counts={counts} />
          </aside>
        )}
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className={`min-w-0 flex-1 outline-none ${bottomBar ? 'pb-[calc(var(--k-bottom-bar-h)+env(safe-area-inset-bottom))]' : ''}`}
        >
          <div className="mx-auto w-full max-w-[var(--k-content-max)]">
            <Outlet />
          </div>
        </main>
      </div>
      {bottomBar && <BottomBar counts={counts} />}
      <Toaster />
    </div>
  );
}
