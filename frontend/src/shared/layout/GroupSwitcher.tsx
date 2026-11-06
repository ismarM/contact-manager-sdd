import { IconChevronDown, IconStack2 } from '@tabler/icons-react';
import { Fragment, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useMatch } from 'react-router';

import { COLOR_SWATCH } from '../../features/groups/colors';
import { useGroups } from '../../features/groups/groupsContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { focusRing } from '../ui/styles';

/**
 * Preklop skupine pod 1024 px (design.md 7.1, 8.16; FR-002-06): meni z istimi razdelki in omejitvami kot stranski pas.
 * Gumb ima samo ikono (dostopno ime »Preklopi skupino«, WCAG 2.5.3 – kot meni računa, CR-01).
 */
export function GroupSwitcher() {
  const { t } = useTranslation();
  const { sections, error, refresh } = useGroups();
  const current = useMatch('/groups/:groupId/*')?.params.groupId;
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={t('groups.switchGroup')}
        className={`flex h-11 items-center gap-1 rounded-md border border-border bg-card px-2 text-foreground hover:bg-muted pointer-coarse:h-12 ${focusRing}`}
      >
        <IconStack2 aria-hidden="true" size={24} stroke={1.75} />
        <IconChevronDown aria-hidden="true" size={20} stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[calc(100dvh-5rem)] max-w-[calc(100vw-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        {sections.map((section, index) => (
          <Fragment key={section.role}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup aria-labelledby={`switcher-${section.role}`}>
              <DropdownMenuLabel id={`switcher-${section.role}`}>
                {t(`roles.${section.role}`)}
              </DropdownMenuLabel>
              {section.items.map((group) => (
                <DropdownMenuItem key={group.id} asChild>
                  <Link
                    to={`/groups/${group.id}`}
                    aria-current={group.id === current ? 'page' : undefined}
                    className="aria-[current=page]:bg-selected"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-5 w-1 shrink-0 rounded-sm ${COLOR_SWATCH[group.color]}`}
                    />
                    <span className="truncate">{group.title}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
        {error && (
          <>
            <DropdownMenuLabel>{t('groups.loadFailed')}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={refresh}>{t('groups.retry')}</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/groups/archived">{t('groups.archivedList.link')}</Link>
        </DropdownMenuItem>
        {sections.some((section) => section.total > section.items.length) && (
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
