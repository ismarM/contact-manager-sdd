import { useCallback, useState } from 'react';

import { ApiError } from '../../../shared/api/client';
import { useGroup } from '../../groups/groupContext';
import type { SelectionCheckRequest, SelectionCheckResult } from '../types';
import { useSelectionApi } from './api';
import type { Selection } from './selection';
import { useSelection } from './selectionContext';

/** Obvestilo pred končno akcijo (FR-009-18) ali po `409 SELECTION_CHANGED` (FR-009-10). */
export type CheckNotice =
  | { kind: 'changed'; result: SelectionCheckResult; limit: boolean }
  | { kind: 'missing'; missing: string[] };

/** Telo `selection-check` iz izbora: trenutni kontakti in za vsako poizvedbo njeni izbrani ter ročno odznačeni. */
export function checkRequest(selection: Selection): SelectionCheckRequest {
  return {
    contactIds: [...selection.ids],
    queries: selection.queries.map((query) => ({
      ...(query.params.q !== '' ? { q: query.params.q } : {}),
      ...(query.params.f.length > 0 ? { f: query.params.f } : {}),
      ...(query.params.tag.length > 0 ? { tag: query.params.tag } : {}),
      contactIds: [...query.added].filter((id) => selection.ids.has(id)),
      excludedIds: [...query.deselected],
    })),
  };
}

/** Manjkajoči kontakti iz `409 SELECTION_CHANGED` (sicer `null`). */
export function isSelectionChanged(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'SELECTION_CHANGED') {
    return null;
  }
  const body = error.body;
  if (body && typeof body === 'object' && 'missing' in body && Array.isArray(body.missing)) {
    return body.missing.filter((id): id is string => typeof id === 'string');
  }
  return [];
}

interface Options<T> {
  /** Množična operacija nad identitetami (bulk-update ali bulk-delete). */
  run: (ids: string[]) => Promise<T>;
  /** Operacija je uspela. */
  onSuccess: (result: T) => void;
}

/**
 * Končna akcija z zaščito pred spremenjenim izborom (FR-009-18, research R-10): pred operacijo pošlje
 * `selection-check`; ob spremembi akcije ne izvede in pokaže obvestilo (*Posodobi izbor*, *Nadaljuj z obstoječim
 * izborom*); `409 SELECTION_CHANGED` med izvedbo pokaže isto obvestilo samo z manjkajočimi kontakti (FR-009-10). Druge
 * napake vrne klicatelju (`error`), ki jih prikaže po svoje; pri `403` in `409 GROUP_ARCHIVED` se skupina ponovno prebere,
 * da se akcije pisanja skrijejo (FR-009-15).
 */
export function useSelectionCheck<T>({ run, onSuccess }: Options<T>) {
  const api = useSelectionApi();
  const { group, reload } = useGroup();
  const selection = useSelection();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<CheckNotice | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [removeNoLonger, setRemoveNoLonger] = useState(true);

  const fail = useCallback(
    (caught: unknown) => {
      const missing = isSelectionChanged(caught);
      if (missing) {
        setNotice({ kind: 'missing', missing });
        return;
      }
      if (
        caught instanceof ApiError &&
        (caught.status === 403 || (caught.status === 409 && caught.code === 'GROUP_ARCHIVED'))
      ) {
        void reload();
      }
      setError(caught);
    },
    [reload],
  );

  const execute = useCallback(
    async (ids: string[]) => {
      try {
        onSuccess(await run(ids));
      } catch (caught) {
        fail(caught);
      }
    },
    [run, onSuccess, fail],
  );

  /** *Uporabi* / *Izbriši*: preverjanje, nato operacija. Dvojni klik med pošiljanjem je prezrt. */
  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let check: SelectionCheckResult;
      try {
        check = await api.selectionCheck(group.id, checkRequest(selection.selection));
      } catch (caught) {
        fail(caught);
        return;
      }
      if (check.changed) {
        setRemoveNoLonger(true);
        setNotice({ kind: 'changed', result: check, limit: false });
        return;
      }
      await execute([...selection.selection.ids]);
    } finally {
      setBusy(false);
    }
  }, [busy, api, group.id, selection.selection, fail, execute]);

  /** *Posodobi izbor*: izbor se uskladi s preverjanjem (meja 10 000 velja), akcija se ne izvede. */
  const updateSelection = useCallback(() => {
    if (notice?.kind !== 'changed') return;
    if (selection.applyCheck(notice.result, removeNoLonger) === 'limit') {
      setNotice({ ...notice, limit: true });
    } else {
      setNotice(null);
    }
  }, [notice, removeNoLonger, selection]);

  /** *Nadaljuj z obstoječim izborom*: neobstoječi kontakti se odstranijo, operacija se izvede takoj. */
  const continueAnyway = useCallback(async () => {
    if (notice?.kind !== 'changed' || busy) return;
    const missing = new Set(notice.result.missing);
    setBusy(true);
    setNotice(null);
    try {
      selection.removeMissing(notice.result.missing);
      const remaining = [...selection.selection.ids].filter((id) => !missing.has(id));
      if (remaining.length > 0) await execute(remaining);
    } finally {
      setBusy(false);
    }
  }, [notice, busy, selection, execute]);

  /** *Odstrani jih iz izbora* po `409 SELECTION_CHANGED`. */
  const removeMissing = useCallback(() => {
    if (notice?.kind !== 'missing') return;
    selection.removeMissing(notice.missing);
    setNotice(null);
  }, [notice, selection]);

  return {
    busy,
    notice,
    error,
    removeNoLonger,
    setRemoveNoLonger,
    submit,
    updateSelection,
    continueAnyway,
    removeMissing,
    clearError: () => setError(null),
  };
}
