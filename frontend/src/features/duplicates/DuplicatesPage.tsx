import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { useGroup } from '../groups/groupContext';
import { DuplicateResults } from './DuplicateResults';
import { DuplicateSearchForm } from './DuplicateSearchForm';
import { DuplicatesUnavailable } from './DuplicatesUnavailable';
import { duplicatesSearch, readDuplicatesView } from './duplicateRouting';
import type { DuplicateCategory } from './types';

/**
 * Razdelek *Dvojniki* (plan.md 011 – Pages and routes; FR-011-01, FR-011-02, FR-011-19): obrazec in rezultati; stanje
 * iskanja je v naslovu (`category`, `page`, `size`), bralec in arhivirana skupina dobita razlago brez klica API.
 */
export function DuplicatesPage() {
  const { t } = useTranslation();
  const { group } = useGroup();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const view = readDuplicatesView(params);
  const [searches, setSearches] = useState(0);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(t('title.groupScreen', { screen: t('duplicates.heading'), group: group.title }));

  if (group.archived || group.role === 'VIEWER') return <DuplicatesUnavailable group={group} />;

  const search = (category: DuplicateCategory) => {
    const next = duplicatesSearch(category, 1, view.size);
    setParams(next, {
      replace: next === duplicatesSearch(view.category ?? category, view.page, view.size),
    });
    setSearches((n) => n + 1);
  };
  const gone = (location.state as { gone?: boolean } | null)?.gone === true;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[70ch] flex-col gap-4 px-4 py-6"
    >
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {t('duplicates.heading')}
      </h2>
      <DuplicateSearchForm
        key={view.category ?? 'none'}
        initial={view.category}
        onSearch={search}
      />
      {view.category && (
        <DuplicateResults
          groupId={group.id}
          view={{ ...view, category: view.category }}
          reloadKey={searches}
          gone={gone}
          headingRef={heading}
        />
      )}
    </section>
  );
}
