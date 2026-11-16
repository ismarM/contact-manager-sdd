import { useMemo } from 'react';

import { useAuth } from '../auth/authContext';
import type { ArchivedGroups, GroupSections } from '../groups/types';
import type { ApiKey, ApiKeyCreate, ApiKeyCreated } from './types';

// Odjemalec upravljanja API ključev 019 (plan.md – Public Interfaces, contracts/openapi.yaml).

/** Skupina, ki jo uporabnik lahko izbere za ključ (vsaka članska vloga, tudi arhivirana – FR-019-01). */
export interface SelectableGroup {
  id: string;
  title: string;
  archived: boolean;
}

/** Največ skupin na stran seznama skupin (`size` ≤ 100); ključ ima lahko največ 50 skupin. */
const GROUP_PAGE = 100;

export function useApiKeysApi() {
  const { authFetch } = useAuth();
  return useMemo(
    () => ({
      list: (signal?: AbortSignal) => authFetch<ApiKey[]>('/me/api-keys', { signal }),
      create: (input: ApiKeyCreate) =>
        authFetch<ApiKeyCreated>('/me/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      revoke: (keyId: string) =>
        authFetch<void>(`/me/api-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' }),
      /** Aktivne skupine (vse vloge) in arhivirane, po naslovu. */
      groups: async (lang: 'sl' | 'en', signal?: AbortSignal): Promise<SelectableGroup[]> => {
        const query = `size=${GROUP_PAGE}&lang=${lang}`;
        const [active, archived] = await Promise.all([
          authFetch<GroupSections>(`/groups?${query}`, { signal }),
          authFetch<ArchivedGroups>(`/groups/archived?${query}`, { signal }),
        ]);
        const groups: SelectableGroup[] = [
          ...active.sections.flatMap((section) =>
            section.items.map((group) => ({ id: group.id, title: group.title, archived: false })),
          ),
          ...archived.items.map((group) => ({ id: group.id, title: group.title, archived: true })),
        ];
        return groups.sort((a, b) => a.title.localeCompare(b.title, lang));
      },
    }),
    [authFetch],
  );
}

export type ApiKeysApi = ReturnType<typeof useApiKeysApi>;
