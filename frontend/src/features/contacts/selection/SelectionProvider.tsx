import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import type { SelectionCheckResult } from '../types';
import * as model from './selection';
import { type Selection, type SelectionChange, type SelectionParams } from './selection';
import {
  type SelectionContextValue,
  SelectionContext,
  type SelectionOutcome,
} from './selectionContext';

/**
 * Izbor kontaktov skupine (FR-009-01, FR-009-02; research R-10): živi samo v pomnilniku vmesnika – ne v naslovu in ne
 * v shrambi – dokler je odprta ista skupina; osvežitev strani, odjava, druga skupina in *Počisti izbor* ga izbrišejo.
 * Operacije vrnejo `limit`, če bi izbor presegel 10 000 kontaktov (izbor je tedaj nespremenjen).
 */
export function SelectionProvider({ groupId, children }: { groupId: string; children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(() => model.emptySelection(groupId));
  const current = useRef(selection);
  // Druga skupina: `GroupScreen` je ključen z `groupId`, zato se izbor ob preklopu skupine izgubi z ostalim stanjem.

  const commit = useCallback((next: Selection) => {
    current.current = next;
    setSelection(next);
  }, []);
  const run = useCallback(
    (change: SelectionChange): SelectionOutcome => {
      if (!change.ok) return 'limit';
      commit(change.selection);
      return 'ok';
    },
    [commit],
  );

  const value = useMemo<SelectionContextValue>(
    () => ({
      selection,
      count: selection.ids.size,
      isSelected: (id) => selection.ids.has(id),
      pageState: (pageIds) => model.pageState(selection, pageIds),
      toggle: (id) => run(model.toggle(current.current, id)),
      setPage: (pageIds, selected) => run(model.setPage(current.current, pageIds, selected)),
      addMatches: (params: SelectionParams, ids: string[]) =>
        run(model.addMatches(current.current, params, ids)),
      applyCheck: (check: SelectionCheckResult, removeNoLongerMatching: boolean) =>
        run(model.applyCheck(current.current, check, removeNoLongerMatching)),
      removeMissing: (ids) => commit(model.removeMissing(current.current, ids)),
      clear: () => commit(model.clear(current.current)),
    }),
    [selection, run, commit],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
