import { useTranslation } from 'react-i18next';
import { Link, useMatch } from 'react-router';

import { COLOR_SWATCH } from '../../features/groups/colors';
import { useGroups } from '../../features/groups/groupsContext';
import { NewGroupDialog } from '../../features/groups/NewGroupDialog';
import { cn } from '../lib/cn';
import { focusRing, secondaryButton } from '../ui/styles';

/**
 * Stranski pas od 1024 px (design.md 7.1; FR-002-06): moje skupine po vlogah (brez praznih razdelkov), največ 10 na
 * razdelek in »Vse skupine«, kadar jih je več; trenutna skupina je označena kot trenutna stran; *Nova skupina*.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { sections } = useGroups();
  const current = useMatch('/groups/:groupId/*')?.params.groupId;

  return (
    <nav
      aria-label={t('groups.myGroups')}
      className="flex w-64 shrink-0 flex-col gap-4 border-r border-border bg-sidebar p-4 text-sidebar-foreground"
    >
      {sections.map((section) => (
        <section key={section.role} className="flex flex-col gap-1">
          <h2 className="px-2 text-sm font-bold text-muted-foreground">
            {t(`roles.${section.role}`)}
          </h2>
          <ul className="flex flex-col">
            {section.items.map((group) => (
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
          {section.total > section.items.length && (
            <Link
              to="/"
              className={`rounded-md px-2 py-1 font-bold text-primary underline underline-offset-4 ${focusRing}`}
            >
              {t('groups.allGroups')}
            </Link>
          )}
        </section>
      ))}
      <NewGroupDialog className={`${secondaryButton} w-full`} />
    </nav>
  );
}
