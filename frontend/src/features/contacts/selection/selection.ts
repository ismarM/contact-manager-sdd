import type { SelectionCheckResult } from '../types';

// Čisti model izbora (specs/009-mnozicno-urejanje/data-model.md – Selection, research.md R-10, D-73). Vse operacije
// vrnejo nov izbor ali `limit` (izbor se ne spremeni, FR-009-04); izbor ni v naslovu in ne v shrambi (FR-009-02).

/** Največ kontaktov v izboru in v eni množični operaciji (FR-009-04). */
export const SELECTION_LIMIT = 10_000;
/** Največ zapomnjenih poizvedb »Izberi vse zadetke« (R-10, D-73). */
export const MAX_QUERIES = 20;

/** Kanonični parametri iskanja in filtrov 008 (`toApiParams`). */
export interface SelectionParams {
  q: string;
  f: string[];
  tag: string[];
}

export interface SelectionQuery {
  params: SelectionParams;
  /** Kontakti, ki jih je dodala ta poizvedba (tudi ročno odznačeni). */
  added: Set<string>;
  /** Ročno odznačeni kontakti iz `added`. */
  deselected: Set<string>;
}

export interface Selection {
  groupId: string;
  ids: Set<string>;
  queries: SelectionQuery[];
}

export type SelectionChange = { ok: true; selection: Selection } | { ok: false; reason: 'limit' };

export type PageState = 'checked' | 'mixed' | 'unchecked';

export function emptySelection(groupId: string): Selection {
  return { groupId, ids: new Set(), queries: [] };
}

const paramsKey = (params: SelectionParams) =>
  JSON.stringify({ q: params.q, f: params.f, tag: params.tag });

const cloneQuery = (query: SelectionQuery): SelectionQuery => ({
  params: query.params,
  added: new Set(query.added),
  deselected: new Set(query.deselected),
});

const cloneSelection = (selection: Selection): Selection => ({
  groupId: selection.groupId,
  ids: new Set(selection.ids),
  queries: selection.queries.map(cloneQuery),
});

/** Največ 20 poizvedb in 10 000 odznačenih: najstarejšo pozabi, njeni kontakti ostanejo ročno izbrani (R-10, D-73). */
function enforceQueryLimits(selection: Selection): void {
  const deselected = () => selection.queries.reduce((sum, query) => sum + query.deselected.size, 0);
  while (selection.queries.length > MAX_QUERIES) selection.queries.shift();
  while (selection.queries.length > 0 && deselected() > SELECTION_LIMIT) selection.queries.shift();
}

/** Kontakt gre v `ids` (ročno ali prek strani); če je bil odznačen v poizvedbi, se vrne med izbrane. */
function selectId(selection: Selection, id: string): void {
  selection.ids.add(id);
  for (const query of selection.queries) query.deselected.delete(id);
}

/** Kontakt gre iz `ids`; če ga ima poizvedba med zadetki, ga zapomni kot odznačenega. */
function deselectId(selection: Selection, id: string): void {
  selection.ids.delete(id);
  for (const query of selection.queries) {
    if (query.added.has(id)) query.deselected.add(id);
  }
}

/** Kontakt pripada največ eni poizvedbi: odstrani ga iz vseh poizvedb razen izjeme. */
function releaseFromQueries(selection: Selection, id: string, except?: SelectionQuery): void {
  for (const query of selection.queries) {
    if (query === except) continue;
    query.added.delete(id);
    query.deselected.delete(id);
  }
}

const limit = (): SelectionChange => ({ ok: false, reason: 'limit' });

export function toggle(selection: Selection, id: string): SelectionChange {
  const next = cloneSelection(selection);
  if (next.ids.has(id)) {
    deselectId(next, id);
  } else {
    if (next.ids.size + 1 > SELECTION_LIMIT) return limit();
    selectId(next, id);
  }
  enforceQueryLimits(next);
  return { ok: true, selection: next };
}

export function setPage(
  selection: Selection,
  pageIds: string[],
  selected: boolean,
): SelectionChange {
  const next = cloneSelection(selection);
  const unique = [...new Set(pageIds)];
  if (selected) {
    const fresh = unique.filter((id) => !next.ids.has(id)).length;
    if (next.ids.size + fresh > SELECTION_LIMIT) return limit();
    for (const id of unique) selectId(next, id);
  } else {
    for (const id of unique) deselectId(next, id);
  }
  enforceQueryLimits(next);
  return { ok: true, selection: next };
}

export function addMatches(
  selection: Selection,
  params: SelectionParams,
  ids: string[],
): SelectionChange {
  const unique = [...new Set(ids)];
  const fresh = unique.filter((id) => !selection.ids.has(id)).length;
  if (selection.ids.size + fresh > SELECTION_LIMIT) return limit();

  const next = cloneSelection(selection);
  const key = paramsKey(params);
  const index = next.queries.findIndex((query) => paramsKey(query.params) === key);
  const previous = index >= 0 ? next.queries.splice(index, 1)[0] : undefined;
  const merged: SelectionQuery = previous ?? {
    params: { q: params.q, f: [...params.f], tag: [...params.tag] },
    added: new Set(),
    deselected: new Set(),
  };
  for (const id of unique) {
    releaseFromQueries(next, id);
    merged.added.add(id);
    merged.deselected.delete(id);
    next.ids.add(id);
  }
  next.queries.push(merged);
  enforceQueryLimits(next);
  return { ok: true, selection: next };
}

export function removeMissing(selection: Selection, ids: string[]): Selection {
  const next = cloneSelection(selection);
  for (const id of ids) {
    next.ids.delete(id);
    releaseFromQueries(next, id);
  }
  return next;
}

export function applyCheck(
  selection: Selection,
  check: SelectionCheckResult,
  removeNoLongerMatching: boolean,
): SelectionChange {
  const next = removeMissing(selection, check.missing);
  check.queries.forEach((result, index) => {
    const query = next.queries[index];
    if (!query) return;
    for (const id of result.newMatches) {
      releaseFromQueries(next, id, query);
      query.added.add(id);
      query.deselected.delete(id);
      next.ids.add(id);
    }
    if (removeNoLongerMatching) {
      for (const id of result.noLongerMatching) {
        next.ids.delete(id);
        query.added.delete(id);
        query.deselected.delete(id);
      }
    }
  });
  if (next.ids.size > SELECTION_LIMIT) return limit();
  enforceQueryLimits(next);
  return { ok: true, selection: next };
}

export function clear(selection: Selection): Selection {
  return emptySelection(selection.groupId);
}

export function pageState(selection: Selection, pageIds: string[]): PageState {
  if (pageIds.length === 0) return 'unchecked';
  const count = pageIds.filter((id) => selection.ids.has(id)).length;
  if (count === 0) return 'unchecked';
  return count === pageIds.length ? 'checked' : 'mixed';
}
