import { createContext, useContext } from 'react';

import type { GroupItem } from './types';

/** Moje nearhivirane skupine za preklopnik (research R-07; do 100 skupin, vloga na elementu). */
export interface GroupsContextValue {
  groups: GroupItem[];
  /** Skupno število mojih nearhiviranih skupin (lahko več kot `groups`). */
  total: number;
  loading: boolean;
  error: boolean;
  /** Ponovno naloži seznam (po ustvarjanju ali urejanju skupine). */
  refresh: () => void;
}

const EMPTY: GroupsContextValue = {
  groups: [],
  total: 0,
  loading: false,
  error: false,
  refresh: () => undefined,
};

export const GroupsContext = createContext<GroupsContextValue>(EMPTY);

export function useGroups(): GroupsContextValue {
  return useContext(GroupsContext);
}
