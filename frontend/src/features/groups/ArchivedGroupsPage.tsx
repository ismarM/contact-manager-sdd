import { EmptyState } from '../../shared/ui/EmptyState';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NoContactsIllustration } from '../../shared/ui/illustrations';
import { textLink } from '../../shared/ui/styles';
import { GroupBrowser } from './GroupBrowser';

/**
 * Zaslon *Arhivirane* (design.md 9.2; FR-003-07, -08, FR-020-13): ista zbirka in orodna vrstica kot *Skupine*, s
 * značkama *Arhivirana* / *Trajno arhivirana*; prazno stanje s povezavo na seznam skupin.
 */
export function ArchivedGroupsPage() {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(t('title.archived'));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:gap-7 md:px-8 md:py-8">
      <div className="flex flex-col gap-1">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none md:text-3xl">
          {t('groups.archivedList.heading')}
        </h1>
        <p className="text-muted-foreground">{t('groups.archivedList.subtitle')}</p>
      </div>
      <GroupBrowser
        kind="archived"
        headingRef={heading}
        empty={
          <EmptyState
            centered
            illustration={<NoContactsIllustration size={180} />}
            title={t('groups.archivedList.empty')}
            action={
              <Link to="/" className={textLink}>
                {t('groups.archivedList.back')}
              </Link>
            }
          />
        }
      />
    </div>
  );
}
