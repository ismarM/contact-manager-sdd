import { type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import { NoResultsIllustration } from '../../shared/ui/illustrations';
import { Callout } from '../../shared/ui/Callout';
import { Skeleton } from '../../shared/ui/Skeleton';
import { secondaryButton, textLink } from '../../shared/ui/styles';
import { GroupCollection } from './GroupCollection';
import { GroupToolbar } from './GroupToolbar';
import { PAGE_SIZES, SectionPagination } from './SectionPagination';
import { type GroupListKind, useGroupList } from './useGroupList';

/**
 * Zbirka skupin z orodno vrstico, stanji in paginacijo (FR-020-10 … -13): ista za *Skupine* (`active`) in *Arhivirane*
 * (`archived`). `empty` je vsebina, kadar uporabnik nima nobene skupine (brez iskanja in filtra).
 */
export function GroupBrowser({
  kind,
  headingRef,
  empty,
}: {
  kind: GroupListKind;
  headingRef: RefObject<HTMLHeadingElement | null>;
  empty: ReactNode;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const list = useGroupList(kind, headingRef);
  const { result, loading, filtering } = list;
  const total = result?.total ?? 0;
  const none = !loading && result?.total === 0;
  const firstRun = none && !filtering;
  const listLabel = t(kind === 'active' ? 'groups.heading' : 'groups.archivedList.pagination');

  return (
    <>
      {!firstRun && (
        <GroupToolbar q={list.q} role={list.role} onSearch={list.setSearch} onRole={list.setRole} />
      )}
      {list.showLoader && <p role="status">{t('groups.loading')}</p>}
      {!loading && result && total > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {filtering
            ? t('groups.search.results', { count: total })
            : t('groups.count', { count: total })}
        </p>
      )}
      {list.showLoader && !result && (
        <ul
          aria-busy="true"
          className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4 xl:grid-cols-3"
        >
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              aria-hidden="true"
              className="flex h-36 flex-col gap-3 rounded-md bg-muted p-5"
            >
              <Skeleton className="h-12 w-12" />
              <Skeleton className="w-2/3" />
            </li>
          ))}
        </ul>
      )}
      {list.failed && (
        <Callout
          tone="error"
          action={
            <button type="button" className={secondaryButton} onClick={list.retry}>
              {t('groups.retry')}
            </button>
          }
        >
          {t('groups.loadFailed')}
        </Callout>
      )}
      {firstRun && empty}
      {none && filtering && (
        <section className="flex flex-col items-center gap-3 py-8 text-center">
          <NoResultsIllustration size={160} />
          <h2 className="text-xl font-semibold">{t('groups.search.none')}</h2>
          <Link to={pathname} replace className={textLink}>
            {t('groups.search.clear')}
          </Link>
        </section>
      )}
      {result && result.items.length > 0 && (
        <GroupCollection
          items={result.items}
          label={listLabel}
          busy={loading}
          archived={kind === 'archived'}
        />
      )}
      {result && result.total > PAGE_SIZES[0] && (
        <SectionPagination
          label={t('groups.pagination.label', { list: listLabel })}
          page={result.page}
          size={result.size}
          total={result.total}
          disabled={loading}
          onPage={list.setPage}
          onSize={list.setSize}
        />
      )}
    </>
  );
}
