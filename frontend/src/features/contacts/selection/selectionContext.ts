import { createContext, useContext } from 'react';

import type { SelectionCheckResult } from '../types';
import type { PageState, Selection, SelectionParams } from './selection';

/** Izid operacije izbora: `limit` = izbor ni spremenjen, ker bi presegel 10 000 (FR-009-04). */
export type SelectionOutcome = 'ok' | 'limit';

export interface SelectionContextValue {
  selection: Selection;
  count: number;
  isSelected: (id: string) => boolean;
  pageState: (pageIds: string[]) => PageState;
  toggle: (id: string) => SelectionOutcome;
  setPage: (pageIds: string[], selected: boolean) => SelectionOutcome;
  addMatches: (params: SelectionParams, ids: string[]) => SelectionOutcome;
  applyCheck: (check: SelectionCheckResult, removeNoLongerMatching: boolean) => SelectionOutcome;
  removeMissing: (ids: string[]) => void;
  clear: () => void;
}

export const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection(): SelectionContextValue {
  const value = useContext(SelectionContext);
  if (!value) throw new Error('useSelection zunaj SelectionProvider');
  return value;
}
