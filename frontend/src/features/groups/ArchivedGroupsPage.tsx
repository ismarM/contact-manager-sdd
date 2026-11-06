import { IconAlertTriangle, IconArchive } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useGroupsApi, useListLanguage } from './api';
import { COLOR_SWATCH } from './colors';
import { PAGE_SIZES, SectionPagination } from './SectionPagination';
import type { ArchivedGroups } from './types';
import { useDelayed } from './useDelayed';

interface Loaded {
  key: string;
  result: ArchivedGroups | null;
}

/**
 * Zaslon *Arhivirane skupine* (design.md 9.2, 8.9; FR-003-07, FR-003-08): en seznam po naslovu s paginacijo (25/50/100),
 * vrstica z jezičkom, naslovom, opisom, številom kontaktov, vlogo in oznako *Arhivirano*; trajno arhivirana skupina ima
 * opombo o izbrisanem lastniku; prazno stanje s povezavo na seznam skupin.
 */
export function ArchivedGroupsPage() {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  const key = `${lang}:${page}:${size}:${tick}`;
  useDocumentTitle(t('title.archived'));

  useEffect(() => {
    let active = true;
    api.listArchived({ page, size, lang }).then(
      (result) => {
        if (!active) return;
        setLoaded({ key, result });
        if (focusAfterLoad.current) {
          focusAfterLoad.current = false;
          heading.current?.focus();
        }
      },
      () => {
        if (active) setLoaded({ key, result: null });
      },
    );
    return () => {
      active = false;
    };
  }, [api, lang, page, size, key]);

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const result = loaded?.result;
  const empty = !loading && result?.total === 0;

  return (
    <div className="mx-auto flex max-w-[80ch] flex-col gap-6 px-4 py-8">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
        {t('groups.archivedList.heading')}
      </h1>
      {showLoader && <p role="status">{t('groups.loading')}</p>}
      {!loading && result === null && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('groups.loadFailed')}</span>
          <button type="button" className={secondaryButton} onClick={() => setTick((v) => v + 1)}>
            {t('groups.retry')}
          </button>
        </div>
      )}
      {empty && (
        <section className="flex flex-col items-start gap-3">
          <h2 className="text-xl font-bold">{t('groups.archivedList.empty')}</h2>
          <Link
            to="/"
            className={`font-bold text-primary underline underline-offset-4 ${focusRing}`}
          >
            {t('groups.archivedList.back')}
          </Link>
        </section>
      )}
      {result && result.items.length > 0 && (
        <ul
          aria-busy={loading}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
        >
          {result.items.map((group) => (
            <li key={group.id} className="flex min-w-0 items-start gap-3 p-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 inline-block h-6 w-1 shrink-0 rounded-sm ${COLOR_SWATCH[group.color]}`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  to={`/groups/${group.id}`}
                  className={`truncate rounded-sm font-bold text-foreground underline-offset-4 hover:underline ${focusRing}`}
                >
                  {group.title}
                </Link>
                {group.description && (
                  <p className="truncate text-muted-foreground">{group.description}</p>
                )}
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-md border border-border px-2 py-0.5 text-muted-foreground">
                    <span className="sr-only">{t('groups.header.rolePrefix')}</span>
                    {t(`roles.${group.role}`)}
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-warning">
                    <IconArchive aria-hidden="true" size={16} stroke={1.75} />
                    {t('groups.header.archived')}
                  </span>
                  {group.permanentlyArchived && (
                    <em className="text-muted-foreground">
                      {t('groups.archivedList.ownerDeleted')}
                    </em>
                  )}
                </p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">
                {t('groups.contactCount', { count: group.contactCount })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result && result.total > PAGE_SIZES[0] && (
        <SectionPagination
          label={t('groups.pagination.label', { list: t('groups.archivedList.pagination') })}
          page={result.page}
          size={result.size}
          total={result.total}
          disabled={loading}
          onPage={(next) => {
            focusAfterLoad.current = true;
            setPage(next);
          }}
          onSize={(next) => {
            setPage(0);
            setSize(next);
          }}
        />
      )}
    </div>
  );
}
