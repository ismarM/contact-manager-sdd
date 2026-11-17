import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { focusRing } from '../../shared/ui/styles';
import { ArchivedGroupsList } from './ArchivedGroupsList';

/**
 * Zaslon *Arhivirane skupine* (design.md 9.2; FR-003-07, FR-003-08): naslov, seznam ({@link ArchivedGroupsList}) in
 * prazno stanje s povezavo na seznam skupin.
 */
export function ArchivedGroupsPage() {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(t('title.archived'));

  return (
    <div className="mx-auto flex max-w-[80ch] flex-col gap-6 px-4 py-8">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
        {t('groups.archivedList.heading')}
      </h1>
      <ArchivedGroupsList
        headingRef={heading}
        empty={
          <section className="flex flex-col items-start gap-3">
            <h2 className="text-xl font-bold">{t('groups.archivedList.empty')}</h2>
            <Link
              to="/"
              className={`font-bold text-primary underline underline-offset-4 ${focusRing}`}
            >
              {t('groups.archivedList.back')}
            </Link>
          </section>
        }
      />
    </div>
  );
}
