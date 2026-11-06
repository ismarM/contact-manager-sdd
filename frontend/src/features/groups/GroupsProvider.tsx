import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { useGroupsApi, useListLanguage } from './api';
import { GroupsContext, type GroupsContextValue } from './groupsContext';
import type { GroupSection } from './types';

/** Največ skupin na razdelek v stranskem pasu in meniju preklopa (FR-002-06). */
export const SUMMARY_SIZE = 10;

interface Loaded {
  key: string;
  sections: GroupSection[];
  error: boolean;
}

/**
 * Povzetek mojih skupin za stranski pas in meni preklopa (research R-09): naloži se ob prijavljeni strani, ob menjavi
 * jezika (abecedni red) in ob `refresh()` po ustvarjanju ali urejanju skupine. Samo v pomnilniku.
 */
export function GroupsProvider({ children }: { children: ReactNode }) {
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${lang}:${tick}`;

  useEffect(() => {
    let active = true;
    api.listGroups({ size: SUMMARY_SIZE, lang }).then(
      (result) => {
        if (active) setLoaded({ key, sections: result.sections, error: false });
      },
      () => {
        if (active)
          setLoaded((previous) => ({ key, sections: previous?.sections ?? [], error: true }));
      },
    );
    return () => {
      active = false;
    };
  }, [api, lang, key]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const value = useMemo<GroupsContextValue>(
    () => ({
      sections: loaded?.sections ?? [],
      loading: loaded?.key !== key,
      error: loaded?.error ?? false,
      refresh,
    }),
    [loaded, key, refresh],
  );

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}
