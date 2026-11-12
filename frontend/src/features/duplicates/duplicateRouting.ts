import type { DuplicateCategory } from './types';

// Stanje strani v naslovu poti (plan.md – Pages and routes): category, page (1-osno), size, ids, total. Neveljavni
// parametri se prezrejo (privzete vrednosti).

export const CATEGORIES: readonly DuplicateCategory[] = ['name', 'email', 'phone'];
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_SIZE = 25;
export const COMPARE_LIMIT = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DuplicatesView {
  /** `null`: brez veljavne kategorije – samo obrazec, brez iskanja. */
  category: DuplicateCategory | null;
  /** 1-osno. */
  page: number;
  size: number;
}

export function readDuplicatesView(params: URLSearchParams): DuplicatesView {
  const category = params.get('category');
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  return {
    category: CATEGORIES.find((candidate) => candidate === category) ?? null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
  };
}

/** Poizvedba rezultatov (`?category=…&page=…&size=…`). */
export function duplicatesSearch(category: DuplicateCategory, page: number, size: number): string {
  return `?${new URLSearchParams({ category, page: String(page), size: String(size) }).toString()}`;
}

export interface CompareView extends DuplicatesView {
  ids: string[];
  total: number;
}

/** `ids`: različni veljavni uuid, največ 10; `total` (samo prikaz) je celo število ≥ 0, sicer število `ids`. */
export function readCompareView(params: URLSearchParams): CompareView {
  const ids = [
    ...new Set((params.get('ids') ?? '').split(',').filter((id) => UUID.test(id))),
  ].slice(0, COMPARE_LIMIT);
  const raw = params.get('total');
  const total = raw === null || raw === '' ? Number.NaN : Number(raw);
  return {
    ...readDuplicatesView(params),
    ids,
    total: Number.isInteger(total) && total >= 0 ? total : ids.length,
  };
}

export function compareSearch(view: DuplicatesView, ids: string[], total: number): string {
  const params = new URLSearchParams();
  if (view.category) params.set('category', view.category);
  params.set('page', String(view.page));
  params.set('size', String(view.size));
  params.set('ids', ids.join(','));
  params.set('total', String(total));
  return `?${params.toString()}`;
}
