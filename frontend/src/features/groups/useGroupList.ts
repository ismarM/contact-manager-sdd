import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'react-router';

import { useGroupsApi, useListLanguage } from './api';
import { PAGE_SIZES } from './SectionPagination';
import { type ArchivedGroupSummary, type GroupItem, ROLES, type Role } from './types';
import { useDelayed } from './useDelayed';

/** Skupina v zbirki: aktivna (`GET /api/groups`) ali arhivirana (`GET /api/groups/archived`). */
export type GroupEntry = GroupItem & Partial<Pick<ArchivedGroupSummary, 'permanentlyArchived'>>;

export type GroupListKind = 'active' | 'archived';

interface Loaded {
  key: string;
  /** `null` = napaka nalaganja. */
  result: { total: number; page: number; size: number; items: GroupEntry[] } | null;
}

/**
 * Podatki in URL stanje zbirke skupin (FR-020-10, -11, -13): iskalni niz `q`, ena vloga `role` in stran `page` (od 1)
 * so v URL; velikost strani je lokalna. Menjava iskanja, vloge ali velikosti vrne prvo stran.
 */
export function useGroupList(
  kind: GroupListKind,
  headingRef: RefObject<HTMLHeadingElement | null>,
) {
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [params, setParams] = useSearchParams();
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const focusAfterLoad = useRef(false);

  const q = params.get('q')?.trim() ?? '';
  const roleParam = params.get('role');
  const role = useMemo<Role | undefined>(
    () => ROLES.find((value) => value === roleParam),
    [roleParam],
  );
  const pageParam = Number(params.get('page'));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam - 1 : 0;
  const key = `${kind}:${lang}:${tick}:${q}:${role ?? ''}:${page}:${size}`;

  useEffect(() => {
    let active = true;
    const request =
      kind === 'active'
        ? api.listGroups({ role, q, page: page === 0 ? undefined : page, size, lang })
        : api.listArchived({
            roles: role ? [role] : [],
            q,
            page: page === 0 ? undefined : page,
            size,
            lang,
          });
    (request as Promise<NonNullable<Loaded['result']>>).then(
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
    // `key` vsebuje vse vhode zahtevka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, headingRef]);

  const update = useCallback(
    (change: { q?: string; role?: Role | null; page?: number }) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (change.q !== undefined) {
            if (change.q) next.set('q', change.q);
            else next.delete('q');
          }
          if (change.role !== undefined) {
            if (change.role) next.set('role', change.role);
            else next.delete('role');
          }
          if (change.page !== undefined && change.page > 0)
            next.set('page', String(change.page + 1));
          else next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  return {
    q,
    role,
    filtering: q !== '' || role !== undefined,
    loading,
    showLoader,
    result: loaded?.result,
    failed: !loading && loaded?.result === null,
    retry: () => setTick((value) => value + 1),
    setSearch: (next: string) => update({ q: next, page: 0 }),
    setRole: (next: Role | null) => update({ role: next, page: 0 }),
    setPage: (next: number) => {
      focusAfterLoad.current = true;
      update({ page: next });
    },
    setSize: (next: number) => {
      setSize(next);
      update({ page: 0 });
    },
    clear: () => update({ q: '', role: null, page: 0 }),
  };
}
