import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { FirstRunIllustration } from '../../shared/ui/illustrations';
import { GroupBrowser } from './GroupBrowser';
import { NewGroupDialog } from './NewGroupDialog';

/**
 * Zaslon *Skupine* na `/` (design.md 9.2; FR-020-10 … -12, FR-002-05, -13): naslov s primarnim gumbom *Nova skupina* in
 * ena paginirana zbirka kartic z vlogo ({@link GroupBrowser}); prazno stanje z ilustracijo in akcijo *Nova skupina*.
 */
export function GroupsPage() {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(t('title.groups'));
  // Po zapustitvi skupine (007) fokus prevzame naslov strani (state `focusHeading` iz preusmeritve).
  const location = useLocation();
  useEffect(() => {
    if ((location.state as { focusHeading?: boolean } | null)?.focusHeading)
      heading.current?.focus();
  }, [location.state]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:gap-7 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-semibold outline-none md:text-3xl"
          >
            {t('groups.heading')}
          </h1>
          <p className="text-muted-foreground">{t('groups.subtitle')}</p>
        </div>
        <NewGroupDialog />
      </header>
      <GroupBrowser
        kind="active"
        headingRef={heading}
        empty={
          <section className="flex flex-col items-center gap-3 py-10 text-center">
            <FirstRunIllustration size={200} />
            <h2 className="text-xl font-semibold">{t('groups.empty')}</h2>
            <p className="max-w-prose text-muted-foreground">{t('groups.emptyHint')}</p>
          </section>
        }
      />
    </div>
  );
}
