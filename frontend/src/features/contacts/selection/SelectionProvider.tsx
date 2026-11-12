import { type ReactNode, useMemo } from 'react';

import { emptySelection } from './selection';
import { SelectionContext, type SelectionContextValue } from './selectionContext';

/** Ogrodje (T006): prazen izbor, operacije ne naredijo nič; izvedba v T039. */
export function SelectionProvider({ groupId, children }: { groupId: string; children: ReactNode }) {
  const value = useMemo<SelectionContextValue>(
    () => ({
      selection: emptySelection(groupId),
      count: 0,
      isSelected: () => false,
      pageState: () => 'unchecked',
      toggle: () => 'ok',
      setPage: () => 'ok',
      addMatches: () => 'ok',
      applyCheck: () => 'ok',
      removeMissing: () => undefined,
      clear: () => undefined,
    }),
    [groupId],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
