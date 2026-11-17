import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { useGroupsApi, useListLanguage } from './api';
import { GroupsContext, type GroupsContextValue } from './groupsContext';
import type { GroupPage } from './types';

/** Največ skupin v preklopniku (R-07; največja velikost strani zaledja). */
export const SWITCHER_SIZE = 100;

interface Loaded {
  key: string;
  page: GroupPage | null;
  error: boolean;
}

/**
 * Seznam mojih skupin za preklopnik (research R-07, R-09): naloži se ob prijavljeni strani, ob menjavi jezika
 * (abecedni red) in ob `refresh()` po ustvarjanju ali urejanju skupine. Samo v pomnilniku.
 */
export function GroupsProvider({ children }: { children: ReactNode }) {
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${lang}:${tick}`;

  useEffect(() => {
    let active = true;
    api.listGroups({ size: SWITCHER_SIZE, lang }).then(
      (result) => {
        if (active) setLoaded({ key, page: result, error: false });
      },
      () => {
        if (active) setLoaded((previous) => ({ key, page: previous?.page ?? null, error: true }));
      },
    );
    return () => {
      active = false;
    };
  }, [api, lang, key]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const value = useMemo<GroupsContextValue>(
    () => ({
      groups: loaded?.page?.items ?? [],
      total: loaded?.page?.total ?? 0,
      loading: loaded?.key !== key,
      error: loaded?.error ?? false,
      refresh,
    }),
    [loaded, key, refresh],
  );

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}
