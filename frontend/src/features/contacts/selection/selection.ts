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

/** Ogrodje (T006): izvedba v T038. */
export const toggle: (selection: Selection, id: string) => SelectionChange = () => {
  throw new Error('not implemented');
};

export const setPage: (
  selection: Selection,
  pageIds: string[],
  selected: boolean,
) => SelectionChange = () => {
  throw new Error('not implemented');
};

export const addMatches: (
  selection: Selection,
  params: SelectionParams,
  ids: string[],
) => SelectionChange = () => {
  throw new Error('not implemented');
};

export const applyCheck: (
  selection: Selection,
  check: SelectionCheckResult,
  removeNoLongerMatching: boolean,
) => SelectionChange = () => {
  throw new Error('not implemented');
};

export const removeMissing: (selection: Selection, ids: string[]) => Selection = () => {
  throw new Error('not implemented');
};

export const clear: (selection: Selection) => Selection = () => {
  throw new Error('not implemented');
};

export const pageState: (selection: Selection, pageIds: string[]) => PageState = () => {
  throw new Error('not implemented');
};
