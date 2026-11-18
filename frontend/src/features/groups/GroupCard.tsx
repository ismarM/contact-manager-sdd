import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import { ArchivedBadge, RoleBadge } from '../../shared/ui/Badge';
import { Monogram } from '../../shared/ui/Monogram';
import { cn } from '../../shared/lib/cn';
import { focusRing, interactiveCard } from '../../shared/ui/styles';
import type { GroupEntry } from './useGroupList';

/**
 * Kartica skupine (design.md 8.5, 8.17a; FR-020-10, -13): monogram ali slika, naziv, opis (ali »Brez opisa«), število
 * kontaktov in značka vloge (z vizualno skritim »Vloga:«). Cela kartica je ena povezava (povezava naziva se razširi čez
 * kartico), zato je dostopno ime povezave samo naziv. Arhivirana skupina ima še značko stanja in opombo o lastniku.
 */
export function GroupCard({ group, archived = false }: { group: GroupEntry; archived?: boolean }) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        interactiveCard,
        'relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:p-5',
        'hover:border-input has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring',
      )}
    >
      <Monogram
        title={group.title}
        color={group.color}
        size={48}
        photo={{ path: `/groups/${group.id}/photo`, revision: group.photoRevision }}
      />
      <div className="flex min-w-0 flex-col gap-1 md:order-3 md:col-span-2 md:h-full">
        <Link
          to={`/groups/${group.id}`}
          className={cn(
            'line-clamp-2 rounded-sm text-lg font-semibold break-words text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none',
            focusRing,
          )}
        >
          {group.title}
        </Link>
        <span className="line-clamp-2 text-sm break-words text-muted-foreground">
          {group.description ? group.description : <em>{t('groups.details.noDescription')}</em>}
        </span>
        {archived && (
          <span className="flex flex-wrap items-center gap-2 pt-1">
            <ArchivedBadge permanent={group.permanentlyArchived} />
            {group.permanentlyArchived && (
              <em className="text-sm text-muted-foreground">
                {t('groups.archivedList.ownerDeleted')}
              </em>
            )}
          </span>
        )}
        <span className="pt-1 text-sm text-muted-foreground tabular-nums md:mt-auto md:pt-2">
          {t('groups.contactCount', { count: group.contactCount })}
        </span>
      </div>
      <RoleBadge value={group.role} className="justify-self-end md:order-2" />
    </li>
  );
}
