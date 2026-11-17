import { IconAlertTriangle, IconArchive } from '@tabler/icons-react';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Avatar } from '../../shared/images/Avatar';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useGroupsApi, useListLanguage } from './api';
import { COLOR_SWATCH } from './colors';
import { PAGE_SIZES, SectionPagination } from './SectionPagination';
import type { ArchivedGroups, Role } from './types';
import { useDelayed } from './useDelayed';

interface Loaded {
  key: string;
  result: ArchivedGroups | null;
}

/**
 * Seznam arhiviranih skupin (design.md 9.2, 8.9; FR-003-07, FR-003-08, FR-017-16): en seznam po naslovu s paginacijo
 * (25/50/100), vrstica z jezičkom, naslovom, opisom, številom kontaktov, vlogo in oznako *Arhivirano*; trajno arhivirana
 * skupina ima opombo o izbrisanem lastniku. Uporabljata ga stran *Arhivirane skupine* in domača stran s filtrom
 * *Stanje*; `q` in `roles` ožita seznam (ob spremembi se seznam ponovno izriše na prvi strani – `key` klicatelja).
 * `empty` je vsebina, kadar je seznam prazen; `announce` objavi število zadetkov (`role=status`).
 */
export function ArchivedGroupsList({
  q,
  roles,
  headingRef,
  empty,
  announce = false,
}: {
  q?: string;
  roles?: Role[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  empty: ReactNode;
  announce?: boolean;
}) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const focusAfterLoad = useRef(false);
  const roleKey = roles?.join(',') ?? '';
  const key = `${lang}:${q ?? ''}:${roleKey}:${page}:${size}:${tick}`;

  useEffect(() => {
    let active = true;
    api
      .listArchived({ q, roles: roleKey ? (roleKey.split(',') as Role[]) : [], page, size, lang })
      .then(
        (result) => {
          if (!active) return;
          setLoaded({ key, result });
          if (focusAfterLoad.current) {
            focusAfterLoad.current = false;
            headingRef.current?.focus();
          }
        },
        () => {
          if (active) setLoaded({ key, result: null });
        },
      );
    return () => {
      active = false;
    };
  }, [api, lang, q, roleKey, page, size, key, headingRef]);

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const result = loaded?.result;
  const isEmpty = !loading && result?.total === 0;

  return (
    <>
      {showLoader && <p role="status">{t('groups.loading')}</p>}
      {announce && !loading && result && result.total > 0 && (
        <p role="status">{t('groups.search.results', { count: result.total })}</p>
      )}
      {!loading && result === null && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('groups.loadFailed')}</span>
          <button type="button" className={secondaryButton} onClick={() => setTick((v) => v + 1)}>
            {t('groups.retry')}
          </button>
        </div>
      )}
      {isEmpty && empty}
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
    </>
  );
}
