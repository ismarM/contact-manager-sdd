import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { Avatar } from '../../shared/images/Avatar';
import { useGroupsApi, useListLanguage } from './api';
import { ArchivedGroupsList } from './ArchivedGroupsList';
import { COLOR_SWATCH } from './colors';
import { GroupSearchControls, type SearchState } from './GroupSearchControls';
import { NewGroupDialog } from './NewGroupDialog';
import { PAGE_SIZES, SectionPagination } from './SectionPagination';
import { type GroupItem, ROLES } from './types';
import { useDelayed } from './useDelayed';

interface Loaded {
  key: string;
  /** `null` = napaka nalaganja. */
  result: { total: number; page: number; size: number; items: GroupItem[] } | null;
}

/** Zaledje sprejme eno vlogo; pri več izbranih vlogah se naloži največja stran in filtrira v odjemalcu. */
const MULTI_ROLE_SIZE = 100;

/**
 * Zaslon *Skupine* na `/` (design.md 9.2; FR-002-04, -05, -09, -13): moje nearhivirane skupine v razdelkih po vlogi,
 * prazno stanje z akcijo *Nova skupina*, nalaganje in napaka nalaganja s ponovnim poskusom. Od 017 iskanje po nazivu,
 * filter vlog in stanja (*Aktivne*, *Arhivirane*) – stanje je v URL (`q`, `role`, `state`), število zadetkov se objavi.
 */
export function GroupsPage() {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [tick, setTick] = useState(0);
  // Stran velja samo za iskanje in filter, pri katerem je izbrana; menjava vrne prvo stran.
  const [pageState, setPageState] = useState({ filterKey: '', index: 0 });
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const focusAfterLoad = useRef(false);
  // Po zapustitvi skupine (007) fokus prevzame naslov strani (state `focusHeading` iz preusmeritve).
  const location = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if ((location.state as { focusHeading?: boolean } | null)?.focusHeading)
      heading.current?.focus();
  }, [location.state]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const roleParam = params.getAll('role').join(',');
  const roles = useMemo(
    () => ROLES.filter((role) => roleParam.split(',').includes(role)),
    [roleParam],
  );
  const archived = params.get('state') === 'archived';
  const filtering = q !== '' || roles.length > 0;
  const search = useMemo<SearchState>(() => ({ q, roles, archived }), [q, roles, archived]);
  const changeSearch = useCallback(
    (next: SearchState) =>
      setParams(
        (previous) => {
          const result = new URLSearchParams(previous);
          result.delete('q');
          result.delete('role');
          result.delete('state');
          if (next.q) result.set('q', next.q);
          next.roles.forEach((role) => result.append('role', role));
          if (next.archived) result.set('state', 'archived');
          return result;
        },
        { replace: true },
      ),
    [setParams],
  );
  const filterKey = `${q}:${roleParam}`;
  const pageIndex = pageState.filterKey === filterKey ? pageState.index : 0;
  const multiRole = roles.length > 1;
  const effectivePage = multiRole ? 0 : pageIndex;
  const effectiveSize = multiRole ? MULTI_ROLE_SIZE : pageSize;
  const singleRole = roles.length === 1 ? roles[0] : undefined;
  const key = `${lang}:${tick}:${q}:${roleParam}:${effectivePage}:${effectiveSize}`;
  useDocumentTitle(t('title.groups'));

  useEffect(() => {
    let active = true;
    if (archived) return;
    api
      .listGroups({
        role: singleRole,
        q,
        page: effectivePage === 0 ? undefined : effectivePage,
        size: effectiveSize,
        lang,
      })
      .then(
        (page) => {
          if (!active) return;
          const items = multiRole ? page.items.filter((i) => roles.includes(i.role)) : page.items;
          setLoaded({
            key,
            result: { ...page, items, total: multiRole ? items.length : page.total },
          });
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
    // `roles` je določen z `roleParam` (ključ).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, lang, q, archived, key]);

  const loading = !archived && loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const result = archived ? undefined : loaded?.result;
  const hits = result?.total ?? 0;
  const empty = !loading && result?.total === 0;
  const noResults = (
    <section className="flex flex-col items-start gap-3">
      <h2 className="text-xl font-bold">{t('groups.search.none')}</h2>
      <Link
        to="/"
        replace
        className={`font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`}
      >
        {t('groups.search.clear')}
      </Link>
    </section>
  );

  return (
    <div className="mx-auto flex max-w-[80ch] flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
          {t('groups.heading')}
        </h1>
        {!archived && (filtering || hits > 0) && <NewGroupDialog />}
      </div>
      <p>
        <Link
          to="/groups/archived"
          className={`font-bold text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`}
        >
          {t('groups.archivedList.link')}
        </Link>
      </p>
      {!(empty && !filtering) && <GroupSearchControls state={search} onChange={changeSearch} />}
      {archived && (
        <ArchivedGroupsList
          key={`${lang}:${q}:${roleParam}`}
          q={q}
          roles={roles}
          headingRef={heading}
          announce
          empty={
            filtering ? (
              noResults
            ) : (
              <h2 className="text-xl font-bold">{t('groups.archivedList.empty')}</h2>
            )
          }
        />
      )}
      {showLoader && <p role="status">{t('groups.loading')}</p>}
      {!archived && !loading && filtering && hits > 0 && (
        <p role="status">{t('groups.search.results', { count: hits })}</p>
      )}
      {loading && !loaded?.result && (
        <ul aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <li key={row} aria-hidden="true" className="h-14 rounded-lg bg-muted" />
          ))}
        </ul>
      )}
      {!archived && !loading && loaded && result === null && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('groups.loadFailed')}</span>
          <button type="button" className={secondaryButton} onClick={() => setTick((v) => v + 1)}>
            {t('groups.retry')}
          </button>
        </div>
      )}
      {empty && filtering && noResults}
      {empty && !filtering && (
        <section className="flex flex-col items-start gap-3">
          <h2 className="text-xl font-bold">{t('groups.empty')}</h2>
          <NewGroupDialog />
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
              <Avatar
                kind="group"
                name={group.title}
                colorSeed={group.color}
                size={40}
                alt=""
                photo={{ path: `/groups/${group.id}/photo`, revision: group.photoRevision }}
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
                <p className="text-sm">
                  <span className="rounded-md border border-border px-2 py-0.5 text-muted-foreground">
                    <span className="sr-only">{t('groups.header.rolePrefix')}</span>
                    {t(`roles.${group.role}`)}
                  </span>
                </p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">
                {t('groups.contactCount', { count: group.contactCount })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!multiRole && result && result.total > PAGE_SIZES[0] && (
        <SectionPagination
          label={t('groups.pagination.label', { list: t('groups.heading') })}
          page={result.page}
          size={result.size}
          total={result.total}
          disabled={loading}
          onPage={(next) => {
            focusAfterLoad.current = true;
            setPageState({ filterKey, index: next });
          }}
          onSize={(next) => {
            setPageState({ filterKey, index: 0 });
            setPageSize(next);
          }}
        />
      )}
    </div>
  );
}
