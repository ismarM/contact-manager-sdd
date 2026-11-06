import { IconArchive } from '@tabler/icons-react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { focusRing } from '../../shared/ui/styles';
import { COLOR_SWATCH } from './colors';
import type { GroupDetail } from './types';

/**
 * Glava skupine (design.md 7.1, 8.5; FR-002-07): jeziček, naslov, oznaka vloge (bralnik zaslona prebere »Vloga: …«),
 * oznaka *Arhivirano* in navigacija razdelkov – povezave, ne ARIA zavihki.
 */
export function GroupHeader({ group, focusTitle }: { group: GroupDetail; focusTitle: boolean }) {
  const { t } = useTranslation();
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Po ustvaritvi skupine fokus na naslov (FR-002-03), a samo če ga uporabnik medtem ni premaknil drugam: skupina se
    // lahko naloži šele, ko je uporabnik že fokusiral npr. gumb za preklop skupine (WCAG 3.2.1; D-34).
    const active = document.activeElement;
    if (focusTitle && (active === null || active === document.body)) title.current?.focus();
  }, [focusTitle]);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 border-b border-border px-4 pt-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h1
          id={titleId}
          ref={title}
          tabIndex={-1}
          className="flex min-w-0 items-center gap-3 text-2xl font-bold break-words outline-none"
        >
          <span
            aria-hidden="true"
            className={`inline-block h-8 w-1 shrink-0 rounded-sm ${COLOR_SWATCH[group.color]}`}
          />
          <span className="min-w-0">{group.title}</span>
        </h1>
        <span className="rounded-md border border-border px-2 py-0.5 text-sm text-muted-foreground">
          <span className="sr-only">{t('groups.header.rolePrefix')}</span>
          {t(`roles.${group.role}`)}
        </span>
        {group.archived && (
          <span className="flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-sm text-warning">
            <IconArchive aria-hidden="true" size={20} stroke={1.75} />
            {t('groups.header.archived')}
          </span>
        )}
      </div>
      <nav aria-label={t('groups.header.sections')} className="flex gap-4 overflow-x-auto">
        <NavLink
          to={`/groups/${group.id}/settings`}
          className={`-mb-px border-b-4 border-transparent px-1 pb-2 font-bold aria-[current=page]:border-primary ${focusRing}`}
        >
          {t('groups.header.settings')}
        </NavLink>
      </nav>
    </section>
  );
}
