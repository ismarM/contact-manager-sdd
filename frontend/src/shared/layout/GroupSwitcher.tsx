import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useMatch } from 'react-router';

import { useGroups } from '../../features/groups/groupsContext';
import type { GroupItem } from '../../features/groups/types';
import { Monogram } from '../ui/Monogram';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const TABS = ['contacts', 'duplicates', 'audit', 'attributes', 'settings'] as const;

/** Zavihek odprte skupine (`deleted-contacts` sodi h kontaktom); `null`, če pot ni v skupini. */
export function currentTab(pathname: string): (typeof TABS)[number] | null {
  const section = /^\/groups\/[^/]+\/([^/]+)/.exec(pathname)?.[1];
  if (section === undefined) return null;
  if (section === 'deleted-contacts') return 'contacts';
  return (TABS as readonly string[]).includes(section) ? (section as (typeof TABS)[number]) : null;
}

/** Cilj izbire skupine (FR-020-06): isti zavihek, kjer obstaja (*Dvojniki* le urednik in višje), sicer privzeti. */
export function switchTarget(group: GroupItem, tab: ReturnType<typeof currentTab>): string {
  const exists = tab !== null && !(tab === 'duplicates' && group.role === 'VIEWER');
  return `/groups/${group.id}/${exists ? tab : 'contacts'}`;
}

/**
 * Preklopnik skupin (design.md 8.16; FR-020-06): meni z nearhiviranimi skupinami uporabnika (do 100); izbira odpre
 * skupino na istem zavihku. Sprožilec (kartica *Trenutna skupina* ali naziv v glavi na telefonu) poda klicatelj; njegovo
 * dostopno ime je ime menija.
 */
export function GroupSwitcher({
  children,
  align = 'start',
  triggerRef,
}: {
  children: ReactNode;
  align?: 'start' | 'end';
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const { groups, total, error, refresh } = useGroups();
  const { pathname } = useLocation();
  const current = useMatch('/groups/:groupId/*')?.params.groupId;
  const tab = currentTab(pathname);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef?.current?.focus();
        }}
      >
        {groups.map((group) => (
          <DropdownMenuItem key={group.id} asChild>
            <Link
              to={switchTarget(group, tab)}
              aria-current={group.id === current ? 'page' : undefined}
              className="aria-[current=page]:bg-selected"
            >
              <Monogram
                title={group.title}
                color={group.color}
                size={24}
                photo={{ path: `/groups/${group.id}/photo`, revision: group.photoRevision }}
              />
              <span className="truncate">{group.title}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        {error && (
          <>
            <DropdownMenuLabel>{t('groups.loadFailed')}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={refresh}>{t('groups.retry')}</DropdownMenuItem>
          </>
        )}
        {total > groups.length && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/">{t('groups.allGroups')}</Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
