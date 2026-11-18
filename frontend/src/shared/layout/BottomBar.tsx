import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import { cn } from '../lib/cn';
import { focusRing } from '../ui/styles';
import { activeNav, NAV_ICON, NAV_PATH, type NavKey } from './nav';
import type { NavCounts } from './useNavCounts';

/**
 * Spodnja vrstica pod 640 px (design.md 7.1; FR-020-07): točno štiri postavke *Skupine*, *Arhivirane*, *Povabila*,
 * *Račun* (ikona 24 px in napis); aktivna ima pilulo `accent-soft` za ikono in `aria-current="page"`. Brez podčrtavanja
 * (FR-020-26); upošteva varno območje (PWA).
 */
export function BottomBar({ counts }: { counts: NavCounts }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = activeNav(pathname);
  const invitations = counts.invitations ?? 0;

  const items: { key: NavKey; label: string; name?: string }[] = [
    { key: 'groups', label: t('groups.heading') },
    { key: 'archived', label: t('shell.archived') },
    {
      key: 'invitations',
      label: t('invitations.link.text'),
      name:
        invitations > 0
          ? t('invitations.link.nameNew', { count: invitations })
          : t('invitations.link.name'),
    },
    { key: 'account', label: t('shell.accountTab') },
  ];

  return (
    <nav
      aria-label={t('shell.mainNav')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-popover pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid h-[var(--k-bottom-bar-h)] grid-cols-4">
        {items.map(({ key, label, name }) => {
          const Icon = NAV_ICON[key];
          const current = active === key;
          return (
            <li key={key} className="min-w-0">
              <Link
                to={NAV_PATH[key]}
                aria-label={name}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground aria-[current=page]:font-bold aria-[current=page]:text-foreground',
                  focusRing,
                )}
              >
                {/* Napis je v DOM pred ikono (prikazan pod njo z `order-last`): vidno besedilo »Povabila 1« je tako
                    vsebovano v imenu »Povabila, 1 novo« (WCAG 2.5.3, axe label-content-name-mismatch). */}
                <span className="order-last max-w-full truncate px-1">{label}</span>
                {/* Presledek loči napis in število: vidno besedilo »Povabila 1«, ne »Povabila1«. */}{' '}
                <span
                  className={cn(
                    'relative flex h-8 w-14 items-center justify-center rounded-full',
                    current && 'bg-selected text-primary',
                  )}
                >
                  <Icon aria-hidden="true" size={24} stroke={1.75} />
                  {key === 'invitations' && invitations > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 right-1 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-bold text-primary-foreground"
                    >
                      {invitations}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
