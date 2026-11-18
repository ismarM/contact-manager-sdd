import { createContext, useContext } from 'react';

import type { GroupDetail } from './types';

/**
 * Skupina, ki je trenutno odprta (FR-020-05): ogrodje (stranska vrstica) je zunaj okvirja skupine, zato ga okvir
 * skupine obvesti, katera skupina je naložena (tudi arhivirana, ki je ni v preklopniku). Samo v pomnilniku.
 */
export interface CurrentGroupValue {
  current: GroupDetail | null;
  setCurrent: (group: GroupDetail | null) => void;
}

export const CurrentGroupContext = createContext<CurrentGroupValue>({
  current: null,
  setCurrent: () => undefined,
});

export function useCurrentGroup(): CurrentGroupValue {
  return useContext(CurrentGroupContext);
}
