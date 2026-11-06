import { createContext, useContext } from 'react';

import type { GroupSection } from './types';

/** Povzetek mojih skupin za stranski pas in meni preklopa (research R-09; največ 10 na razdelek). */
export interface GroupsContextValue {
  sections: GroupSection[];
  loading: boolean;
  error: boolean;
  /** Ponovno naloži povzetek (po ustvarjanju ali urejanju skupine). */
  refresh: () => void;
}

const EMPTY: GroupsContextValue = {
  sections: [],
  loading: false,
  error: false,
  refresh: () => undefined,
};

export const GroupsContext = createContext<GroupsContextValue>(EMPTY);

export function useGroups(): GroupsContextValue {
  return useContext(GroupsContext);
}
