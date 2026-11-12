import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { errorAlert, secondaryButton } from '../../shared/ui/styles';
import { SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { useDuplicatesApi } from './api';
import { DuplicateCard } from './DuplicateCard';
import { compareSearch, duplicatesSearch, type DuplicatesView } from './duplicateRouting';
import type { DuplicatePage } from './types';

type Loaded = { key: string; data: DuplicatePage } | { key: string; failed: true };

/**
 * Rezultati iskanja (FR-011-02, FR-011-07, FR-011-21): posnetek skupin dvojnikov s paginacijo, prazno stanje, napaka z
 * ponovitvijo in obvestilo »Te skupine dvojnikov ni več.«; ob menjavi strani fokus na naslov strani.
 */
export function DuplicateResults({
  groupId,
  view,
  reloadKey,
  gone,
  headingRef,
}: {
  groupId: string;
  view: DuplicatesView & { category: NonNullable<DuplicatesView['category']> };
  /** Povečanje ponovno požene isto iskanje (gumb »Poišči dvojnike«). */
  reloadKey: number;
  gone: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useTranslation();
  const api = useDuplicatesApi();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const [retries, setRetries] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const focusHeading = useRef(false);
  const { category, page, size } = view;
  const key = `${category}|${page}|${size}|${reloadKey}|${retries}`;

  useEffect(() => {
    let active = true;
    api.searchDuplicates(groupId, { category, page: page - 1, size }).then(
      (data) => {
        if (!active) return;
        const pages = Math.max(1, Math.ceil(data.total / size));
        if (data.total > 0 && page > pages) {
          setParams(duplicatesSearch(category, pages, size), { replace: true });
          return;
        }
        setLoaded({ key, data });
        if (focusHeading.current) {
          focusHeading.current = false;
          headingRef.current?.focus();
        }
      },
      () => {
        if (active) setLoaded({ key, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [api, groupId, category, page, size, key, setParams, headingRef]);

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const failed = loaded !== null && 'failed' in loaded && !loading;
  const data = loaded !== null && 'data' in loaded ? loaded.data : null;

  const goTo = (nextPage: number, nextSize: number) => {
    focusHeading.current = true;
    setParams(duplicatesSearch(category, nextPage, nextSize));
  };

  const compare = (ids: string[], total: number) =>
    void navigate({
      pathname: `/groups/${groupId}/duplicates/compare`,
      search: compareSearch(view, ids, total),
    });

  return (
    <div aria-busy={loading} className="flex flex-col gap-4">
      {gone && <p role="status">{t('duplicates.gone')}</p>}

      {failed && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('duplicates.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setRetries((n) => n + 1)}
            >
              {t('duplicates.retry')}
            </button>
          </span>
        </div>
      )}

      {loading && showLoader && <p role="status">{t('duplicates.loading')}</p>}

      {!failed && data && data.groups.length === 0 && (
        <p role="status">
          {t('duplicates.empty', { category: t(`duplicates.categories.${category}`) })}
        </p>
      )}

      {!failed && data && data.groups.length > 0 && (
        <>
          <p role="status">{t('duplicates.resultsCount', { count: data.total })}</p>
          <ul aria-label={t('duplicates.groupsList')} className="flex flex-col gap-4">
            {data.groups.map((group) => (
              <DuplicateCard
                key={group.contacts[0]?.id}
                group={group}
                onCompare={() =>
                  compare(
                    group.contacts.slice(0, 10).map((c) => c.id),
                    group.size,
                  )
                }
              />
            ))}
          </ul>
          <SectionPagination
            label={t('duplicates.pages')}
            page={page - 1}
            size={size}
            total={data.total}
            disabled={false}
            onPage={(next) => goTo(next + 1, size)}
            onSize={(next) => goTo(1, next)}
          />
        </>
      )}
    </div>
  );
}
