import { useTranslation } from 'react-i18next';
import { Link, useMatch } from 'react-router';

import { COLOR_SWATCH } from '../../features/groups/colors';
import { useGroups } from '../../features/groups/groupsContext';
import { NewGroupDialog } from '../../features/groups/NewGroupDialog';
import { cn } from '../lib/cn';
import { errorAlert, focusRing, secondaryButton } from '../ui/styles';

/**
 * Stranski pas od 1024 px (design.md 7.1; FR-002-06): moje skupine v enem seznamu (do 100) in »Vse skupine«, kadar jih je več; trenutna skupina je označena kot trenutna stran; *Nova skupina*.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { groups, total, error, refresh } = useGroups();
  const current = useMatch('/groups/:groupId/*')?.params.groupId;

  return (
    <nav
      aria-label={t('groups.myGroups')}
      className="flex w-64 shrink-0 flex-col gap-4 border-r border-border bg-sidebar p-4 text-sidebar-foreground"
    >
      <ul className="flex flex-col">
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              to={`/groups/${group.id}`}
              aria-current={group.id === current ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-md px-2 hover:bg-sidebar-accent aria-[current=page]:bg-selected pointer-coarse:min-h-12',
                focusRing,
              )}
            >
              <span
                aria-hidden="true"
                className={`inline-block h-5 w-1 shrink-0 rounded-sm ${COLOR_SWATCH[group.color]}`}
              />
              <span className="truncate">{group.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {total > groups.length && (
        <Link
          to="/"
          className={`rounded-md px-2 py-1 font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`}
        >
          {t('groups.allGroups')}
        </Link>
      )}
      {error && (
        <div role="alert" className={`${errorAlert} flex-col`}>
          <span>{t('groups.loadFailed')}</span>
          <button type="button" className={secondaryButton} onClick={refresh}>
            {t('groups.retry')}
          </button>
        </div>
      )}
      <Link
        to="/groups/archived"
        className={`rounded-md px-2 py-1 font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`}
      >
        {t('groups.archivedList.link')}
      </Link>
      <NewGroupDialog className={`${secondaryButton} w-full`} />
    </nav>
  );
}
