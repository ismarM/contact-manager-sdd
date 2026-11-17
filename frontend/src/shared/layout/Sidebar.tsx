import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import { cn } from '../lib/cn';
import { focusRing } from '../ui/styles';
import { AccountMenu } from './AccountMenu';
import { CurrentGroupCard } from './CurrentGroupCard';
import { activeNav, NAV_ICON, NAV_PATH, type NavKey } from './nav';
import type { NavCounts } from './useNavCounts';

/** Besedna znamka (povezava na *Skupine*); ni podčrtana (FR-020-26). */
export function Wordmark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md text-xl font-bold text-foreground',
        focusRing,
        className,
      )}
    >
      <span aria-hidden="true" className="inline-block h-6 w-1 shrink-0 rounded-sm bg-primary" />
      <span className="truncate">{t('app.name')}</span>
    </Link>
  );
}

const itemClass = `relative flex min-h-11 items-center gap-3 rounded-md px-3 text-foreground hover:bg-card aria-[current=page]:bg-card aria-[current=page]:font-bold aria-[current=page]:shadow-sm aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:left-0 aria-[current=page]:before:w-[3px] aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-primary pointer-coarse:min-h-12 ${focusRing}`;

/**
 * Vsebina stranske vrstice (design.md 7.1; FR-020-05): navigacija, ne vsebina. Besedna znamka, *Skupine*, *Arhivirane* in
 * *Povabila* (števci; povabila kot značka), znotraj skupine kartica *Trenutna skupina*, na dnu postavka računa. Seznama
 * skupin, *Nove skupine* in stikala teme tu ni. Od 1024 px je stalna, pod tem v ploskvi (FR-020-07).
 */
export function Sidebar({ counts, className }: { counts: NavCounts; className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = activeNav(pathname);
  const groupsCount = useId();
  const archivedCount = useId();
  const invitations = counts.invitations ?? 0;
  const invitationsName =
    invitations > 0
      ? t('invitations.link.nameNew', { count: invitations })
      : t('invitations.link.name');

  const item = (
    key: Exclude<NavKey, 'account'>,
    label: string,
    count: number | null,
    id: string,
  ) => {
    const Icon = NAV_ICON[key];
    return (
      <Link
        to={NAV_PATH[key]}
        aria-current={active === key ? 'page' : undefined}
        aria-describedby={count === null ? undefined : id}
        className={itemClass}
      >
        <Icon aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {count !== null && (
          <span id={id} aria-hidden="true" className="text-xs text-muted-foreground">
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div
      className={cn('flex h-full flex-col gap-4 bg-sidebar p-4 text-sidebar-foreground', className)}
    >
      <Wordmark className="px-2 py-1" />
      <nav aria-label={t('shell.mainNav')} className="flex flex-col gap-1">
        {item('groups', t('groups.heading'), counts.groups, groupsCount)}
        {item('archived', t('shell.archived'), counts.archived, archivedCount)}
        <Link
          to={NAV_PATH.invitations}
          aria-label={invitationsName}
          aria-current={active === 'invitations' ? 'page' : undefined}
          className={itemClass}
        >
          <NAV_ICON.invitations aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1 truncate">{t('invitations.link.text')}</span>
          {invitations > 0 && (
            <span
              aria-hidden="true"
              className="rounded-full bg-primary px-2 text-sm font-bold text-primary-foreground"
            >
              {invitations}
            </span>
          )}
        </Link>
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <CurrentGroupCard />
        <div className="border-t border-border pt-3">
          <AccountMenu variant="item" />
        </div>
      </div>
    </div>
  );
}
