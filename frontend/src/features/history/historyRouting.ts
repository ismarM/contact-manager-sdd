import { DEFAULT_SIZE, PAGE_SIZES } from '../audit/auditRouting';
import type { DeletedQuery, DeletedState } from './types';

// Stanje zaslonov zgodovine v naslovu poti (plan.md 015 – Pages and routes): stran (1-osna), velikost, pri izbrisanih
// še iskanje in stanje. Privzete vrednosti se ne zapišejo, neveljavne se prezrejo.

export { DEFAULT_SIZE, PAGE_SIZES };

export const DELETED_STATES = ['all', 'restorable', 'merged'] as const;

export interface Paging {
  page: number;
  size: number;
}

export function readPaging(params: URLSearchParams): Paging {
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
  };
}

export function pagingSearch(page: number, size: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (size !== DEFAULT_SIZE) params.set('size', String(size));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export interface DeletedView extends Paging, DeletedQuery {}

export function readDeletedView(params: URLSearchParams): DeletedView {
  const state = params.get('state');
  return {
    ...readPaging(params),
    q: (params.get('q') ?? '').slice(0, 100),
    state: DELETED_STATES.includes(state as DeletedState) ? (state as DeletedState) : 'all',
  };
}

export function deletedSearch(view: DeletedView): string {
  const params = new URLSearchParams();
  if (view.q) params.set('q', view.q);
  if (view.state !== 'all') params.set('state', view.state);
  if (view.page > 1) params.set('page', String(view.page));
  if (view.size !== DEFAULT_SIZE) params.set('size', String(view.size));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function hasDeletedFilters(view: DeletedView): boolean {
  return view.q !== '' || view.state !== 'all';
}

/** Ime kontakta iz stanja različice (ime in priimek). */
export function stateName(state: { firstName: string | null; lastName: string | null }): string {
  return [state.firstName, state.lastName].filter((part) => part).join(' ');
}
