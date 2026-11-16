import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useGroupsApi, useListLanguage } from './api';
import { ArchivedGroupsList } from './ArchivedGroupsList';
import { GroupSearchControls, type SearchState } from './GroupSearchControls';
import { GroupSection } from './GroupSection';
import { NewGroupDialog } from './NewGroupDialog';
import { PAGE_SIZES } from './SectionPagination';
import { ROLES, type GroupSection as Section } from './types';
import { useDelayed } from './useDelayed';

interface Loaded {
  key: string;
  sections: Section[] | null;
}

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
  const key = `${lang}:${tick}:${q}`;
  useDocumentTitle(t('title.groups'));

  useEffect(() => {
    let active = true;
    if (archived) return;
    api.listGroups({ size: PAGE_SIZES[0], lang, q }).then(
      (result) => {
        if (active) setLoaded({ key, sections: result.sections });
      },
      () => {
        if (active) setLoaded({ key, sections: null });
      },
    );
    return () => {
      active = false;
    };
  }, [api, lang, q, archived, key]);

  const loading = !archived && loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const all = archived ? undefined : loaded?.sections;
  const sections = all && roles.length > 0 ? all.filter((s) => roles.includes(s.role)) : all;
  const hits = sections?.reduce((sum, s) => sum + s.total, 0) ?? 0;
  const empty = !loading && sections?.length === 0;
  const noResults = (
    <section className="flex flex-col items-start gap-3">
      <h2 className="text-xl font-bold">{t('groups.search.none')}</h2>
      <Link
        to="/"
        replace
        className={`font-bold text-primary underline underline-offset-4 ${focusRing}`}
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
        {!archived && (filtering || (sections && sections.length > 0)) && <NewGroupDialog />}
      </div>
      <p>
        <Link
          to="/groups/archived"
          className={`font-bold text-primary underline underline-offset-4 ${focusRing}`}
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
      {loading && !all && (
        <ul aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <li key={row} aria-hidden="true" className="h-14 rounded-lg bg-muted" />
          ))}
        </ul>
      )}
      {!archived && !loading && loaded && sections === null && (
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
      {sections?.map((section) => (
        <GroupSection
          key={`${section.role}:${loaded?.key ?? ''}`}
          initial={section}
          query={q}
          reloading={loading}
        />
      ))}
    </div>
  );
}
