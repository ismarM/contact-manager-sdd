import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import { GroupSwitcher } from '../../shared/layout/GroupSwitcher';
import { TABLET, useMediaQuery } from '../../shared/lib/useMediaQuery';
import { ArchivedBadge, RoleBadge } from '../../shared/ui/Badge';
import { Monogram } from '../../shared/ui/Monogram';
import { focusRing } from '../../shared/ui/styles';
import type { GroupDetail } from './types';

const tab = `-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-1 font-bold text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground pointer-coarse:min-h-12 ${focusRing}`;

/**
 * Glava skupine (design.md 7.1, 8.5; FR-002-07, FR-020-08): monogram ali slika, naziv, opis, značka vloge (bralnik
 * prebere »Vloga: …«), značka *Arhivirana* in zavihki kot povezave (ne ARIA zavihki) z označenim aktivnim. Na telefonu
 * (< 640 px) je glava strnjena v vrstico, katere naziv odpre preklopnik skupin; zavihki se pomikajo vodoravno.
 */
export function GroupHeader({ group, focusTitle }: { group: GroupDetail; focusTitle: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const roomy = useMediaQuery(TABLET);
  const base = `/groups/${group.id}`;
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const switcher = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Po ustvaritvi skupine fokus na naslov (FR-002-03), a samo če ga uporabnik medtem ni premaknil drugam: skupina se
    // lahko naloži šele, ko je uporabnik že fokusiral npr. gumb za preklop skupine (WCAG 3.2.1; D-34).
    const active = document.activeElement;
    if (focusTitle && (active === null || active === document.body)) title.current?.focus();
  }, [focusTitle]);

  // Razdelek velja tudi za svoje podstrani (npr. podrobnosti kontakta); izbrisani kontakti (015) so zadnji zavihek.
  const within = (section: string) =>
    pathname === `${base}/${section}` || pathname.startsWith(`${base}/${section}/`);
  const tabs: { to: string; label: string; current: boolean }[] = [
    { to: `${base}/contacts`, label: t('groups.header.contacts'), current: within('contacts') },
    ...(!group.archived && group.role !== 'VIEWER'
      ? [{ to: `${base}/duplicates`, label: t('duplicates.tab'), current: within('duplicates') }]
      : []),
    { to: `${base}/audit`, label: t('groups.header.audit'), current: within('audit') },
    { to: `${base}/attributes`, label: t('attributes.heading'), current: within('attributes') },
    { to: `${base}/settings`, label: t('groups.header.settings'), current: within('settings') },
    {
      to: `${base}/deleted-contacts`,
      label: t('contacts.deletedLink'),
      current: within('deleted-contacts'),
    },
  ];

  const badges = (
    <>
      <RoleBadge value={group.role} />
      {group.archived && <ArchivedBadge permanent={group.permanentlyArchived} />}
    </>
  );
  const photo = { path: `/groups/${group.id}/photo`, revision: group.photoRevision };

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 border-b border-border px-4 pt-4 sm:pt-6"
    >
      {roomy ? (
        <div className="flex items-start gap-4">
          <Monogram title={group.title} color={group.color} size={48} photo={photo} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                id={titleId}
                ref={title}
                tabIndex={-1}
                className="min-w-0 text-xl font-bold break-words outline-none"
              >
                {group.title}
              </h1>
              {badges}
            </div>
            {group.description && (
              <p className="break-words text-muted-foreground">{group.description}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative flex min-h-12 items-center gap-2">
            <Monogram title={group.title} color={group.color} size={32} photo={photo} />
            <h1
              id={titleId}
              ref={title}
              tabIndex={-1}
              className="min-w-0 truncate text-xl font-bold outline-none"
              title={group.title}
            >
              {group.title}
            </h1>
            {/* Vloga v isti vrstici kot naziv (dolg naziv se skrajša); prej je bila sama v svoji vrstici. */}
            <span className="flex shrink-0 items-center">
              <RoleBadge value={group.role} />
            </span>
            <span aria-hidden="true" className="flex-1" />
            <GroupSwitcher triggerRef={switcher}>
              <button
                ref={switcher}
                type="button"
                aria-label={t('groups.switchGroup')}
                // Cela vrstica je ciljna površina gumba (naziv odpre preklopnik).
                className={`flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground after:absolute after:inset-0 ${focusRing}`}
              >
                <IconChevronDown aria-hidden="true" size={20} stroke={1.75} />
              </button>
            </GroupSwitcher>
          </div>
          {group.archived && (
            <div className="flex flex-wrap items-center gap-2">
              <ArchivedBadge permanent={group.permanentlyArchived} />
            </div>
          )}
        </div>
      )}
      <nav
        aria-label={t('groups.header.sections')}
        className="-mx-4 flex gap-4 overflow-x-auto px-4"
      >
        {tabs.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            aria-current={item.current ? 'page' : undefined}
            className={tab}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
